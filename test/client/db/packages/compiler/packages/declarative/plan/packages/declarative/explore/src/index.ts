import { createDice } from '@test/client-compiler-plan-share'
import { LAYERS, WEIGHTS } from '@test/client-share'
import { chaos } from './chaos.ts'
import { act } from './draft.ts'
import { edits } from './edit.ts'
import { setup } from './setup.ts'
import type { Code, Spec } from '@test/client-share'
import type { Draft, Move } from './draft.ts'

// 命令を 1 つ足した後の save。毎命令、まれ、無し、時計 (cost.md 5 節の間隔)
const _CADENCE: Record<string, Move> = {
        every: chaos.save,
        rare: (draft) => {
                if (draft.dice.isHit(0.08)) chaos.save(draft)
        },
        none: () => {},
        timer: chaos.tick,
}

// 指定 (seed と設定) → scenario の code を書く命令の列。乱数は seed から作り、この中で閉じる
export const explore = (spec: Spec): Code[] => {
        const seed = spec.seed as number
        const dice = createDice(seed)
        const [size, cadence] = [LAYERS.sizes[seed % 4], LAYERS.cadences[Math.floor(seed / 4) % 4]]
        const [ratio, restart] = LAYERS.restarts[Math.floor(seed / 16) % 3]
        const ids = Array.from({ length: dice.pick(LAYERS.clients) }, (_, index) => `u${index + 1}`)
        const draft: Draft = { dice, seed, size, codes: [], sheets: [], ids, who: 'a', last: ids[0], serial: 0 }
        const moves: [number, Move][] = [...WEIGHTS.map(([weight, name]): [number, Move] => [weight, edits[name]]), [size === 'near' ? 1.5 : 0, edits.over], [100 * restart, chaos.restart], [100 * (spec.crashes as number), chaos.crash], [100 * (spec.faults as number), chaos.fault], [100 * (spec.rivals as number), chaos.rival]]
        const title = `seed ${seed}: image ${size}、save ${cadence}、open と save の比 ${ratio}、client ${ids.length}`
        setup(draft)
        if (cadence === 'timer') act(draft, 'every', 56)
        for (let count = spec.steps as number; count > 0; count--) {
                const before = draft.codes.length
                dice.weigh(moves)(draft)
                if (draft.codes.length > before) _CADENCE[cadence](draft)
        }
        if (cadence !== 'none') act(draft, 'save')
        act(draft, 'stop')
        act(draft, 'open')
        const head = [`// ${title}`, spec.head, '']
        return [['open', spec.file], ...head.map((text): Code => ['line', text]), ...draft.codes, ['line', ''], ['line', 'export default await t.done()'], ['close'], ['send', spec.file, seed], ['shrink', spec.file, spec.fail, spec.trial, spec.shrink]]
}
