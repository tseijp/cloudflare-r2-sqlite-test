import type { Frame, Storage } from '../../../utils/share/types'

export interface ReplicaOptions {
        prefix?: string
        nodeId?: number
        intervals?: number[]
        retentions?: number[]
        snapshot?: number
}

export interface ReplicaConfig {
        prefix: string
        nodeId: number
        intervals: number[]
        retentions: number[]
        snapshot: number
}

export interface PageEntry {
        pgno: number
        offset: number
        size: number
}

export interface Page {
        pgno: number
        data: Uint8Array
}

export interface Block {
        pgno: number
        block: Uint8Array
}

export interface ObjectHeader {
        flags: number
        pageSize: number
        commit: number
        minTxid: number
        maxTxid: number
        timestamp: number
        preApply: bigint
        walOffset: number
        walSize: number
        walSalt1: number
        walSalt2: number
        nodeId: number
}

export interface ObjectTail {
        indexSize: number
        postApply: bigint
        fileCrc: bigint
}

export interface ObjectIndex extends ObjectTail {
        entries: PageEntry[]
}

export interface ParsedObject {
        header: ObjectHeader
        blocks: Block[]
        postApply: bigint
        isValid: boolean
}

export interface ObjectRef {
        key: string
        level: number
        min: number
        max: number
        size: number
}

export interface Sums {
        sums: Map<number, bigint>
        total: bigint
}

export interface ReplicaState {
        loaded: Promise<void> | null
        now: number
        last: number
        commit: number
        sums: Sums | null
        tops: number[]
        born: Map<string, number>
        runs: number[] | null
        snapshotAt: number | null
        base: number
        pruned: number
}

export interface Context {
        storage: Storage
        config: ReplicaConfig
        state: ReplicaState
}

export interface Pushed {
        key: string
        bytes: number
}

export interface Compacted {
        merged: number
        deleted: number
}

export interface Ticked {
        pushed: number
        compacted: number
        snapshotted: boolean
        deleted: number
}

export interface Replica {
        push(frames: Frame[], txid: number): Promise<Pushed>
        compact(level: number): Promise<Compacted>
        snapshot(bytes: Uint8Array, txid: number): Promise<{ key: string }>
        restore(txid?: number): Promise<Uint8Array>
        index(key: string): Promise<PageEntry[]>
        tick(now: number, frames: Frame[]): Promise<Ticked>
        readonly txid: number
}
