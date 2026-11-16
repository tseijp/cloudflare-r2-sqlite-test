import type * as Y from 'yjs'

export interface Part {
        bytes: Uint8Array
        tag: string
}

export interface Store {
        get(seq: number, offset?: number, length?: number): Promise<Part | null>
        put(seq: number, bytes: Uint8Array, tag: string): Promise<string | null>
        delete(seqs: number[]): Promise<unknown>
}

export interface Input {
        wasm: WebAssembly.Module
        store: Store
        doc: Y.Doc
}

export interface Op {
        type: string
        [key: string]: any
}

export type Code = [code: string, ...args: any[]]

export interface Stat {
        pages: number
        base: number
        dirty: number
        deltas: number
        patch: number
}

export interface Delta {
        prev: string
        commit: number
        pages: [pgno: number, bytes: Uint8Array][]
}
