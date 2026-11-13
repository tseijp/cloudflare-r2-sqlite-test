import { content, integrity, orphans, pages } from '@test/server-executer-judge-share'
import { applied, calls, isHit, isStale, kind, mine } from '@test/server-executer-share'
import { others, range, same, shape } from '@test/server-executer-share'
import type { Env } from '@test/server-executer-judge-share'

const _OK = [['ok']]

const _CLEAN = { orphan: 0, long: 0 }

// 安全性のうち、store の内容と呼び出しの記録から確かめる規則
export const safety = (env: Env) => {
        const _log = env.depot.log
        const _check = env.book.check
        // 種類の違う save の交差の後に続く崩れは、原因 crossed として数える
        const _known = () => (env.memo.isCrossed ? 'crossed' : '')
        return {
                // 一意: この手の間の書き込みごとの写しが、開けて、integrity_check が ok
                async unique() {
                        for (const parts of env.depot.shots.slice(env.memo.shot)) {
                                const { db, out } = await env.fleet.look(parts)
                                const rows = out.ok ? await integrity(db) : _OK
                                _check('一意', 'open', out.ok, 'open resolves', out.error)
                                _check('一意', 'integrity', same(rows, _OK), _OK, rows)
                        }
                },
                // 永続: その instance の put が store に入ったら、開き直した内容は twin の内容と一致する
                async durable(on: string) {
                        const replica = env.fleet.of(on)
                        if (!applied(_log, replica).length) return
                        env.memo.good = undefined
                        if (replica.isDoubt || !replica.twin) return env.book.skip('永続: twin が製品と揃っていない')
                        const { db, view, out } = await env.fleet.look(env.depot.copy())
                        if (!out.ok) return _check('永続', 'open', false, 'open resolves', out.error)
                        const want = await content(replica.twin.db)
                        const stray = await orphans(db, pages(view()))
                        const known = isStale(_log, replica) ? 'crossed' : ''
                        env.memo.good = await content(db)
                        _check('永続', 'content', same(want, env.memo.good), want, env.memo.good, known)
                        _check('装飾', 'stored', same(stray, _CLEAN), _CLEAN, stray)
                },
                // 永続: 障害も他の書き手も無い save は解決する
                saved(on: string) {
                        const replica = env.fleet.of(on)
                        const { out, isWrote } = replica
                        if (out.held || isHit(_log, replica) || isStale(_log, replica)) return
                        _check('永続', 'save', out.ok, 'save resolves', out.error, isWrote ? 'wrote' : _known())
                },
                // 原子: 開いた内容は、最後に確かめた store の内容と一致する
                async atomic(on: string) {
                        const replica = env.fleet.of(on)
                        if (!replica.out.ok || !replica.twin) return
                        const got = await content(replica.twin.db)
                        if (env.memo.good === undefined) env.book.skip('原子: 比べる内容が無い')
                        else _check('原子', 'content', same(env.memo.good, got), env.memo.good, got)
                        env.memo.good = got
                },
                // 鎖: object は 0 〜 SLOTS。障害も他の書き手も無く store を呼んだ後は、image と有効な delta だけが在る
                chain(on: string) {
                        const replica = env.fleet.of(on)
                        const seqs = env.depot.list().map(([seq]) => seq as number)
                        const isOdd = isHit(_log, replica) || isStale(_log, replica)
                        _check('鎖', 'slots', seqs.every((seq) => seq <= env.limits.SLOTS), env.limits.SLOTS, seqs)
                        if (!replica.out.ok || !replica.db || !calls(_log, replica).length || isOdd) return
                        const stat = replica.db.stat()
                        const want = stat.base > 0 ? range(0, stat.deltas) : []
                        _check('鎖', 'chain', same(seqs, want), want, seqs, _known())
                },
                // 単一書き: 他が store に書いた後の、それを知らない instance の save は reject する
                writer(on: string) {
                        const replica = env.fleet.of(on)
                        const puts = mine(_log, replica).filter((call) => call.op === 'put' || call.op === 'arrive')
                        const rivals = others(_log, replica)
                        if (!rivals.length || !puts.length || replica.out.held) return
                        const isCross = rivals.some((call) => kind(call) !== kind(puts[0]))
                        const out = replica.out.ok ? 'resolved' : replica.out.error
                        const seen = { rivals: rivals.map(shape), put: shape(puts[0]), out }
                        env.memo.isCrossed ||= isCross && replica.out.ok
                        const cause = isCross ? 'crossed' : ''
                        _check('単一書き', 'stale', !replica.out.ok, 'stale save rejects', seen, cause)
                },
                // 上限: page 数は LIMIT 以下。2 chunk 以上で save が解決した後の patch + dirty は CHUNK 未満
                bound(on: string, isSave: number) {
                        const replica = env.fleet.of(on)
                        const { CHUNK, LIMIT } = env.limits
                        if (!replica.db) return
                        const stat = replica.db.stat()
                        _check('上限', 'pages', stat.pages <= LIMIT, LIMIT, stat.pages)
                        if (!isSave || !replica.out.ok || stat.base <= CHUNK) return
                        _check('上限', 'load', stat.patch + stat.dirty < CHUNK, CHUNK, stat)
                },
                // 上限: reject した書き込みの後、page 数は直前のままである
                intact(on: string) {
                        const replica = env.fleet.of(on)
                        if (!replica.db || replica.out.ok) return
                        const { pages: count } = replica.db.stat()
                        _check('上限', 'intact', count === replica.before.pages, replica.before.pages, count)
                },
        }
}
