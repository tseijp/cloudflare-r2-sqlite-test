import { act, cell, row, step } from './draft.ts'
import { FATES, FAULTS } from './pool.ts'
import type { Draft, Move } from './draft.ts'

// 必ず SQL に書く編集を 1 つ足す。save が store を呼ぶようにするために使う
const _dirty = (draft: Draft) => {
        const [target] = draft.sheets
        act(draft, 'run', cell(draft, target, row(draft, target)))
}

const _other = (draft: Draft) => (draft.who === 'a' ? 'b' : 'a')

// 古い instance の put が進行中に、新しい instance が同じ store を開いて書く。古い put は後から届くか、届かない
const _handover = (draft: Draft) => {
        const old = draft.who
        _dirty(draft)
        act(draft, 'hold')
        act(draft, 'save')
        draft.who = _other(draft)
        act(draft, 'open')
        _dirty(draft)
        act(draft, 'save')
        step(draft, old, 'release', draft.dice.pick(FATES))
        step(draft, old, 'stop')
        act(draft, 'open')
}

// 2 つの instance が同じ store を開いたまま、交互に save する。後の save は古い状態から書く
const _overlap = (draft: Draft) => {
        const old = draft.who
        step(draft, _other(draft), 'open')
        _dirty(draft)
        act(draft, draft.dice.isHit(0.5) ? 'save' : 'merge')
        draft.who = _other(draft)
        _dirty(draft)
        act(draft, 'save')
        step(draft, old, 'stop')
        act(draft, 'open')
}

// instance の作り直し、障害、2 つ目の instance。種類 → scenario に足す手
export const chaos: Record<string, Move> = {
        save: (draft) => act(draft, 'save'),
        // 命令の切れ目での作り直し
        restart: (draft) => {
                act(draft, 'stop')
                act(draft, 'open')
        },
        // store の呼び出しの途中での作り直し。進行中の put は届くか、届かない
        crash: (draft) => {
                _dirty(draft)
                act(draft, 'hold')
                act(draft, 'save')
                act(draft, 'stop')
                act(draft, 'release', draft.dice.pick(FATES))
                act(draft, 'open')
        },
        // store の呼び出しの失敗。get は読みか open に、他は save に当てる。最後に開き直して揃える
        fault: (draft) => {
                const kind = draft.dice.pick(FAULTS)
                _dirty(draft)
                act(draft, 'fault', kind, kind === 'get' ? draft.dice.int(0, 2) : 0)
                if (kind === 'get') act(draft, 'run', { type: 'sql', text: 'select count(*) from "_style"' })
                act(draft, 'save')
                act(draft, 'save')
                act(draft, 'open')
        },
        rival: (draft) => (draft.dice.isHit(0.5) ? _handover(draft) : _overlap(draft)),
        tick: (draft) => step(draft, 't', 'tick', draft.dice.int(1, 40)),
}
