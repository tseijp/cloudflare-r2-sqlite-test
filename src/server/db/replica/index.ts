import { createConfig } from './utils/config/config.ts'
import { createState } from './state.ts'
import { compactLevel } from './compact.ts'
import { pushFrames, pushSnapshot } from './push.ts'
import { readIndex } from './read.ts'
import { restoreImage } from './restore.ts'
import { runTick } from './tick.ts'
import type { Frame, Storage } from '../utils/share/types.ts'
import type { Replica, ReplicaOptions } from './utils/share/types.ts'

export type { Replica, ReplicaOptions, Ticked } from './utils/share/types.ts'

export const createReplica = (storage: Storage, options?: ReplicaOptions): Replica => {
        const _config = createConfig(options)
        const _state = createState()
        const _ctx = { storage, config: _config, state: _state }
        const push = (frames: Frame[], txid: number) => pushFrames(_ctx, frames, txid)
        const compact = (level: number) => compactLevel(_ctx, level)
        return {
                push,
                compact,
                snapshot: (bytes: Uint8Array, txid: number) => pushSnapshot(_ctx, bytes, txid),
                restore: (txid?: number) => restoreImage(_ctx, txid),
                index: async (key: string) => (await readIndex(storage, key)).entries,
                tick: (now: number, frames: Frame[]) => runTick(_ctx, { push, compact }, now, frames),
                get txid() {
                        return _state.last
                },
        }
}
