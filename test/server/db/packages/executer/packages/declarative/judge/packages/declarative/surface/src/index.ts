import { TEXTS } from '@test/server-share'
import { orphans, pages, styles, views } from '@test/server-executer-judge-share'
import { find, isWrite, same, settle } from '@test/server-executer-share'
import type { Code, Db } from '@test/server-share'
import type { Outcome } from '@test/server-executer-share'
import type { Env } from '@test/server-executer-judge-share'

type Rows = Record<string, unknown>

const _compile = (db: Db, op: unknown) => settle(Promise.resolve().then(() => db.compile(op, db.stat())))

const _seen = (out: Outcome) => (out.ok ? out.value : out.error)

// 孤児の検査の問い合わせが実行できなかったときの値
const _LOST = { orphan: -1, long: -1 }

const _pick = (rows: Rows, names: string[]) => Object.fromEntries(names.map((name) => [name, rows[name]]))

// 製品が compile した命令列のうち、SQL の文が入る operand
const _texts = (codes: Code[]) => codes.map((code) => code[TEXTS[code[0]]]).filter((text) => typeof text === 'string')

// 命令の面 (compile、窓、装飾、履歴) の規則。期待値は、同じ製品の twin か、製品が compile した命令列
export const surface = (env: Env) => {
        const _check = env.book.check
        return {
                // compile: 同じ (op, stat) は同じ命令列。利用者が渡した本文と値は SQL の文に現れない
                async compile(on: string, op: unknown, values: string[]) {
                        const replica = env.fleet.of(on)
                        if (!replica.db) return
                        const [first, second] = [await _compile(replica.db, op), await _compile(replica.db, op)]
                        replica.codes = first.ok ? (first.value as Code[]) : null
                        const texts = _texts(replica.codes ?? [])
                        const leaked = values.filter((item) => texts.some((text) => text.includes(item)))
                        _check('compile', 'same', same(first, second), _seen(first), _seen(second))
                        _check('compile', 'bind', !leaked.length, [], leaked)
                },
                // compile: 制約の外の入力は例外になる
                throws(on: string) {
                        const { codes } = env.fleet.of(on)
                        _check('compile', 'throw', codes === null, 'compile throws', codes)
                },
                // compile: 障害の無い命令の結果は、同じ命令を受けた twin の結果と一致する
                parity(on: string) {
                        const { out, echo, isWrote } = env.fleet.of(on)
                        if (!echo || out.held) return
                        const label = out.ok === echo.ok ? 'value' : echo.ok ? 'accept' : 'reject'
                        _check('compile', label, same(out, echo), _seen(echo), _seen(out), isWrote ? 'wrote' : '')
                },
                // 窓: 登録済みの view は、同じ問い合わせを今実行した結果と一致する。
                // rows は size 以下。drop した view の key は残らない
                async view(on: string) {
                        const replica = env.fleet.of(on)
                        const { twin, sizes, slots, isDoubt } = replica
                        if (!replica.out.ok) return
                        const mine = views(replica.view!())
                        const isOver = ([id, size]: [string, number]) => (mine[`${id}/rows`] ?? []).length > size
                        const dropped = (slots.dropped ?? []) as string[]
                        const left = dropped.filter((name) => !replica.views.has(name) && mine[name])
                        _check('窓', 'size', ![...sizes].some(isOver), [], [...sizes].filter(isOver))
                        _check('窓', 'leave', !left.length, [], left)
                        if (isDoubt || !twin) return env.book.skip('窓: twin が製品と揃っていない')
                        const theirs = views(twin.view())
                        const fresh: Rows = {}
                        for (const [name, { text, params }] of replica.views) {
                                fresh[name] = _seen(await settle(twin.db.execute([['sql', text, params]])))
                        }
                        const isOld = (name: string) => !same(fresh[name] ?? [], theirs[name] ?? [])
                        const old = Object.keys({ ...fresh, ...theirs }).filter(isOld)
                        _check('窓', 'twin', same(mine, theirs), theirs, mine)
                        _check('窓', 'fresh', !old.length, _pick(fresh, old), _pick(theirs, old))
                },
                // 装飾: 命令の前に、cell の編集の位置 (編集 key、contract.md 8 節) の _style を覚える
                async styled(on: string) {
                        const { twin, codes, slots, isDoubt } = env.fleet.of(on)
                        const [kind, page, row, col] = JSON.parse((find(codes, ['fill'])?.[1] as string) ?? '[]')
                        const isCell = kind === 'cell' && !!twin && !isDoubt
                        slots.spot = isCell ? [page, row, col] : undefined
                        slots.styles = isCell ? await styles(twin!.db, page, row, col) : undefined
                },
                // 装飾: cell の本文を変えても、その cell の _style は変わらない
                async kept(on: string) {
                        const { out, twin, slots, isDoubt } = env.fleet.of(on)
                        const spot = slots.spot as [string, number, string] | undefined
                        if (!out.ok || isDoubt || !twin || !spot) return
                        const now = await styles(twin.db, ...spot)
                        _check('装飾', 'kept', same(slots.styles, now), slots.styles, now)
                },
                // 装飾: SQL に書く命令の後、孤児は 0 件。_mark の stop は本文の長さ以下
                async tidy(on: string) {
                        const { out, twin, codes, isDoubt } = env.fleet.of(on)
                        if (!out.ok || isDoubt || !twin || !isWrite(codes)) return
                        const { orphan, long } = await orphans(twin.db, pages(twin.view())).catch(() => _LOST)
                        _check('装飾', 'orphan', orphan === 0, 0, orphan)
                        _check('装飾', 'stop', long === 0, 0, long)
                },
                // 履歴: 直前の編集を undo は戻し、redo はやり直す。前後とも値の無い位置への編集は、今の値を変えない
                async history(on: string) {
                        const { out, twin, codes, edits, slots, isDoubt } = env.fleet.of(on)
                        const [way, origin] = (find(codes, ['undo', 'redo']) ?? []) as string[]
                        const edit = edits.get(origin)
                        if (!edit || !out.ok || isDoubt || !twin) return
                        if (edit.isUndone !== (way === 'redo')) return edits.delete(origin)
                        const { value: now } = await settle(twin.db.execute([['sql', edit.text, edit.params]]))
                        const want = edit.isGhost ? slots.was : way === 'undo' ? edit.was : edit.now
                        _check('履歴', way, same(want, now), want, now, edit.isGhost ? 'ghost' : '')
                        edit.isUndone = way === 'undo'
                },
                // 履歴: 読み取りの命令 (read) が返す行は ROWS 以下
                rows(on: string) {
                        const { out, codes } = env.fleet.of(on)
                        if (!out.ok || !find(codes, ['read']) || !Array.isArray(out.value)) return
                        const count = out.value.length - 1
                        _check('履歴', 'rows', count <= env.limits.ROWS, env.limits.ROWS, count)
                },
                // 拒まれるべき命令が reject した
                refuse(on: string, axis: string) {
                        const { out } = env.fleet.of(on)
                        _check(axis, 'reject', !out.ok && !out.held, 'reject', out.held ? 'held' : 'resolved')
                },
        }
}
