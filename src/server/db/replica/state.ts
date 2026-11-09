import { parseHeader } from './decode.ts'
import { ALL_LEVELS, HEADER_SIZE } from './utils/const/const.ts'
import { listLevel, maxOf } from './utils/keys/keys.ts'
import type { Context, ReplicaState } from './utils/types/types.ts'

export const createState = (): ReplicaState => ({
        loaded: null,
        now: 0,
        last: 0,
        commit: 0,
        sums: null,
        tops: [0, 0, 0, 0],
        born: new Map(),
        runs: null,
        snapshotAt: null,
        base: 0,
        pruned: 0,
})

const readSnapshotAt = async ({ storage }: Context, key: string) => {
        const head = await storage.get(key, { offset: 0, length: HEADER_SIZE })
        const header = head && parseHeader(head)
        return header ? header.timestamp : null
}

const fillState = async (ctx: Context) => {
        const { storage, config, state } = ctx
        const levels = await Promise.all(ALL_LEVELS.map((level) => listLevel(storage, config.prefix, level)))
        const snapshots = levels[levels.length - 1]
        const diffs = levels.slice(0, -1)
        state.last = levels.reduce((n, refs) => maxOf(refs, n), state.last)
        state.tops = state.tops.map((top, level) => diffs.slice(level).reduce((n, refs) => maxOf(refs, n), top))
        state.base = maxOf(snapshots, state.base)
        const latest = snapshots.at(-1)
        if (latest) state.snapshotAt = await readSnapshotAt(ctx, latest.key)
}

export const loadState = async (ctx: Context) => {
        const { state } = ctx
        state.loaded ??= fillState(ctx)
        await state.loaded
        return state
}

export const ageOf = (state: ReplicaState, key: string) => {
        if (!state.born.has(key)) state.born.set(key, state.now)
        return state.now - state.born.get(key)!
}
