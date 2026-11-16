import { check, expectOf, isFresh, isOk, isSame, json, key, pagesOf, seeOf, seen, soundOf, sqlOf } from '@db/test-compiler-plan-share'
import type { Code } from '@db/test-share'
import type { Draft } from '@db/test-compiler-plan-share'

type Rule = (draft: Draft) => Code[]

const _ran: Rule = (draft) => {
        const { reg, twin, out, io, at, isSync, isFresh, known } = seen(draft)
        const [payload, via] = draft.kind === 'run:2' ? draft.args : [{}, 'load']
        const token = [payload.type === 'cell' && payload.text, payload.type === 'style' && payload.value].find((text) => typeof text === 'string' && text.length > 5)
        const plan = at('c1')
        if (out === null) return []
        return [
                ...(via === 'run' ? [check('compile', isSame(plan, at('c2')), '同じ (op, stat) は同じ命令列になる')] : []),
                ...(via === 'run' && token && isOk(plan) ? [check('compile', !sqlOf(plan.ok).includes(token), '本文と値は SQL の文に現れない')] : []),
                check('回数', io.put + io.delete === 0, 'save と open の他は store に書かない'),
                ...(isSync && isFresh && io.fail === 0 ? [check('一致', isSame(out, reg[key(twin, 'out')]), `同じ命令は shadow と同じ結果を返す。node ${json(out).slice(0, 120)} shadow ${json(reg[key(twin, 'out')]).slice(0, 120)}`, known)] : []),
        ]
}

const _RULE: Record<string, Rule> = {
        'open:3': (draft) => {
                const { K, reg, twin, out, io, stat, seqs, known } = seen(draft)
                const sum = reg[key(twin, 'sum')]
                if (out === null) return []
                if (!isOk(out)) return io.fail === 0 ? [check('可用', false, `store が応じるとき open は解決する。観測 ${out.error}`, known)] : []
                return [
                        check('可用', true, 'store が応じるとき open は解決する'),
                        check('回数', io.get <= (stat.base <= K.CHUNK ? 1 : 2 + stat.deltas), `open の get は式の回数以下。観測 ${io.get}`),
                        check('回数', io.put === 0, 'open は put しない'),
                        check('chain', seqs.length === (stat.base > 0 ? 1 : 0) + stat.deltas, `open の後に chain の外の delta は残らない。object ${json(seqs)} deltas ${stat.deltas}`, known),
                        check('integrity', isOk(reg[key(twin, 'out')]), 'open の後の store の copy を別の instance で開ける'),
                        ...(typeof reg.saved === 'number' ? [check('原子', [reg.saved, ...reg.maybe].includes(sum), '開き直した内容は、最後に成功した save か進行中だった save と一致する', known)] : []),
                ]
        },
        'run:2': _ran,
        'load:2': _ran,
        'load:3': (draft) => {
                const { at, known } = seen(draft)
                return [check('上限', isSame(at('was'), at('now')), 'reject した取込は内容を変えない', known)]
        },
        'save:3': (draft) => {
                const { K, reg, out, io, stat, seqs, at, isDone, isSync, isOpen, isFresh, known } = seen(draft)
                const [kind, isForced, was] = draft.args
                const isWritten = isDone && io.wrote > 0
                const isIdle = was.base > 0 && (at('wrote') ?? 0) === 0 && !isForced
                const written: Code[] = [
                        check('回数', (kind === 'merge' ? io.image : io.delta) === 1, `put の宛先は compile の出力 (${kind}) と一致する`),
                        ...(at('hurt') ? [] : [check('回数', io.get <= (kind === 'merge' && was.base > K.CHUNK ? 1 : 0), `save の get は式の回数以下。観測 ${io.get}`)]),
                        check('上限', stat.base <= K.CHUNK || stat.patch + stat.dirty < K.CHUNK, '2 chunk 以上の database で save の後の patch + dirty は CHUNK 未満'),
                        ...(io.fail === 0 ? [check('chain', seqs.length === 1 + stat.deltas, `障害が無い save の後に chain の外の delta は残らない。object ${json(seqs)} deltas ${stat.deltas}`, known)] : []),
                        ...soundOf(reg),
                        ...(isSync ? [check('永続', isSame(reg['P.sum'], at('pend')), 'save が成功した store の内容は、save の時点の内容と一致する', known)] : []),
                ]
                if (out === null || !isOpen) return []
                return [
                        check('回数', io.put <= 1, `save 1 回の put は 1 回以下。観測 ${io.put}`),
                        ...(was.dirty === 0 && !isForced ? [check('回数', io.calls === 0, `変化が無い save は store を呼ばない。観測 ${io.calls}`)] : []),
                        ...(isIdle ? [check('回数', io.put === 0, '書き込みが 1 つも解決していない save は put しない', (at('void') ?? 0) > 0 ? '004' : known)] : []),
                        ...(io.fail === 0 && isFresh ? [check('可用', isDone, `障害が無い save は解決する。観測 ${out.error ?? ''}`, known)] : []),
                        ...(isFresh && reg.writer === draft.node ? [] : [check('writer', !isWritten || isFresh, '他の writer の save を知らない save は reject する', '001')]),
                        ...(isWritten ? written : []),
                        ...(isDone && !isWritten && isSync && isFresh && typeof reg.saved === 'number' ? [check('永続', at('pend') === reg.saved, 'store を呼ばなかった save の時点の内容は、保存済みの内容と一致する', known)] : []),
                ]
        },
        'expect:2': (draft) => expectOf(seen(draft), draft.args[0]),
        'see:2': ({ args: [seq, want], facts }) => seeOf(facts.reg, seq, want),
        'audit:3': (draft) => {
                const { reg, twin, at, known } = seen(draft)
                const pages = Object.keys(pagesOf(reg[key(twin, 'schema')]?.ok ?? []))
                const lints: number[][] = [0, ...pages.map((_, index) => index + 1)].map((index) => reg[key(twin, `lint.${index}`)]?.ok?.[0] ?? [-1, -1])
                return [
                        check('window', isSame(at('tree'), reg[key(twin, 'tree')]), '登録済みの view は、登録し直した結果と一致する', known),
                        check('装飾', lints.every(([lost]) => lost === 0), `孤児は 0 件。観測 ${json(lints)}`),
                        check('装飾', lints.every(([, over]) => over === 0), `_mark の stop は本文の長さ以下。観測 ${json(lints)}`),
                ]
        },
        'release:3': ({ node, facts: { reg } }) => {
                const isSaved = !!reg.freed?.isAlive && reg.freed.isApplied && isOk(reg[key(node, 'out')])
                return [...(reg.freed?.isApplied ? soundOf(reg) : []), ...(isSaved ? [check('writer', isFresh(reg, node), '他の writer の save を知らない save は reject する', '001')] : [])]
        },
        mark: ({ args: [name, isHit], facts: { reg } }) => [check('期待', ((reg.marks ?? {})[name] ?? 0) > 0 === isHit, `mark ${name} は${isHit ? '当たる' : '当たらない'}。観測 ${(reg.marks ?? {})[name] ?? 0}`)],
}

export const rule = (draft: Draft): Draft => ({ ...draft, rule: _RULE[draft.kind]?.(draft) ?? [] })
