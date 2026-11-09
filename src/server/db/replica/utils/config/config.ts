import { LEVEL_INTERVALS, LEVEL_RETENTIONS, SNAPSHOT_INTERVAL } from '../share/const.ts'
import type { ReplicaConfig, ReplicaOptions } from '../share/types.ts'

export const createConfig = (options: ReplicaOptions = {}): ReplicaConfig => {
        const prefix = options.prefix ?? ''
        const nodeId = options.nodeId ?? 0
        const intervals = options.intervals ?? LEVEL_INTERVALS
        const retentions = options.retentions ?? LEVEL_RETENTIONS
        const snapshot = options.snapshot ?? SNAPSHOT_INTERVAL
        return { prefix, nodeId, intervals, retentions, snapshot }
}
