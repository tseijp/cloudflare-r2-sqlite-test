import { createConfig } from './utils/config/config.ts'
import { createState } from './state.ts'
import { compactLevel } from './compact.ts'
import { pushFrames, pushSnapshot } from './push.ts'
import { readIndex } from './read.ts'
import { restoreImage } from './restore.ts'
import { runTick } from './tick.ts'
import type { Frame, Storage } from '../utils/share/types.ts'
import type { Replica, ReplicaOptions } from './utils/types/types.ts'

export type { Replica, ReplicaOptions, Ticked } from './utils/types/types.ts'

export const createReplica = (storage: Storage, options?: ReplicaOptions): Replica => {
        const config = createConfig(options)
        const state = createState()
        const ctx = { storage, config, state }
        const push = (frames: Frame[], txid: number) => pushFrames(ctx, frames, txid)
        const compact = (level: number) => compactLevel(ctx, level)
        const snapshot = (bytes: Uint8Array, txid: number) => pushSnapshot(ctx, bytes, txid)
        const restore = (txid?: number) => restoreImage(ctx, txid)
        const index = async (key: string) => (await readIndex(storage, key)).entries
        const tick = (now: number, frames: Frame[]) => runTick(ctx, { push, compact }, now, frames)
        return {
                push,
                compact,
                snapshot,
                restore,
                index,
                tick,
                get txid() {
                        return state.last
                },
        }
}
