import { listLevel } from './utils/keys/keys'
import { ALL_LEVELS, COMPACT_LEVELS, SNAPSHOT_LEVEL } from './utils/share/const'
import { loadState } from './state'
import type { Frame } from '../utils/share/types'
import type { Compacted, Context, Pushed, Ticked } from './utils/share/types'

interface _Ops {
        push(frames: Frame[], txid: number): Promise<Pushed>
        compact(level: number): Promise<Compacted>
}

const _isDue = (now: number, last: number, interval: number) => Math.floor(now / interval) > Math.floor(last / interval)

const _prune = async ({ storage, config, state }: Context) => {
        if (state.base <= state.pruned) return 0
        const base = state.base
        const keys: string[] = []
        for (const level of ALL_LEVELS) {
                for (const ref of await listLevel(storage, config.prefix, level)) {
                        const isBase = level === SNAPSHOT_LEVEL && ref.max === base
                        if (ref.max <= base && !isBase) keys.push(ref.key)
                }
        }
        state.pruned = base
        if (!keys.length) return 0
        await storage.delete(keys)
        for (const key of keys) state.born.delete(key)
        return keys.length
}

export const runTick = async (ctx: Context, ops: _Ops, now: number, frames: Frame[]): Promise<Ticked> => {
        ctx.state.now = now
        const state = await loadState(ctx)
        const runs = state.runs ?? COMPACT_LEVELS.map(() => now)
        const txid = frames.reduce((n, frame) => Math.max(n, frame.txid), 0)
        const pushed = frames.length ? (await ops.push(frames, txid)).bytes : 0
        let compacted = 0
        let deleted = await _prune(ctx)
        state.runs = runs
        for (const [i, level] of COMPACT_LEVELS.entries()) {
                if (!_isDue(now, runs[i], ctx.config.intervals[level])) continue
                runs[i] = now
                const result = await ops.compact(level)
                compacted += result.merged
                deleted += result.deleted
        }
        const snapshotted = state.snapshotAt === null || now - state.snapshotAt >= ctx.config.snapshot
        return { pushed, compacted, snapshotted, deleted }
}
