import { DIFF_LEVELS, SNAPSHOT_LEVEL } from './utils/const/const.ts'
import { listLevel, maxOf, selectChain } from './utils/keys/keys.ts'
import type { Context, ObjectRef } from './utils/types/types.ts'

export const createPlan = async ({ storage, config }: Context, txid?: number) => {
        const levels = await Promise.all(DIFF_LEVELS.map((level) => listLevel(storage, config.prefix, level)))
        const snapshots = await listLevel(storage, config.prefix, SNAPSHOT_LEVEL)
        const goal = txid ?? levels.reduce((n, refs) => maxOf(refs, n), maxOf(snapshots))
        const base = snapshots.filter((ref) => ref.max <= goal).pop()
        const plan: ObjectRef[] = base ? [base] : []
        let max = base ? base.max : 0
        for (const refs of levels) {
                const selected = selectChain(
                        refs.filter((ref) => ref.max <= goal),
                        max,
                )
                plan.push(...selected)
                max = maxOf(selected, max)
        }
        if (max !== goal) return Promise.reject(new Error(`restore: txid ${goal} is not reachable (max ${max})`))
        return plan
}
