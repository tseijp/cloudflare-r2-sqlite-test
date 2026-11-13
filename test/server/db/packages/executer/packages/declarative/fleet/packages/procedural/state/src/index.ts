import { NONE, ZERO } from '@test/server-executer-share'
import type { Replica } from '@test/server-executer-share'

// 作り直しで消える状態。開くまでは、twin と揃っていない
export const fresh = () => ({
        pending: null,
        out: NONE,
        echo: null,
        codes: null,
        before: ZERO,
        edited: -1,
        unsaved: -1,
        writes: 0,
        isRolled: false,
        isDoubt: true,
        isSoiled: false,
        isWrote: false,
        views: new Map(),
        sizes: new Map(),
        edits: new Map(),
        slots: {},
        types: new Set<string>(),
})

// 作り直しても残る状態を足した、instance 1 つぶんの最初の状態
export const blank = (name: string): Replica => {
        const kept = { name, db: null, view: null, twin: null, at: 0, seen: 0, every: 0 }
        return { ...kept, ...fresh() }
}
