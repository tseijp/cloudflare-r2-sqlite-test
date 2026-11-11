export type Code = [string, ...unknown[]]

export interface Move {
        type: string
        on: string
        [field: string]: unknown
}

export interface Stat {
        pages: number
        base: number
        dirty: number
        deltas: number
        patch: number
}

export interface Part {
        bytes: Uint8Array
        tag: string
}

export interface Store {
        get(seq: number, offset?: number, length?: number): Promise<Part | null>
        put(seq: number, bytes: Uint8Array, tag: string): Promise<string | null>
        delete(seqs: number[]): Promise<unknown>
}

export interface Db {
        run(op: unknown): Promise<unknown>
        compile(op: unknown, stat: Stat): Code[]
        execute(codes: Code[]): Promise<unknown>
        stat(): Stat
}

export interface Limits {
        PAGE: number
        CHUNK: number
        ROOM: number
        LIMIT: number
        SWAP: number
        SLOTS: number
        ROWS: number
}

// 製品の instance 1 つ。view は、製品が表示用に載せた「key → 行」の map を返す
export interface Made {
        db: Db
        view(): Record<string, unknown>
}

// scenario の側が渡すもの。製品の定数、instance を作る関数、実時間の打ち切りを頼む関数、
// 崩れの原因 → 既知の issue の番号
export interface Input extends Limits {
        make(store: Store): Made
        limit(seconds: number): unknown
        known: Record<string, string>
}

export interface Seat {
        isLive: boolean
        isHeld: boolean
        every: number
        edited: number
        unsaved: number
        stat: Stat
}

export interface Summary extends Limits {
        clock: number
        seats: Record<string, Seat>
}

export interface Failure {
        step: number
        axis: string
        label: string
        known: string
        expected: unknown
        observed: unknown
}

export interface Bill {
        observed: number
        formula: number
        whole: number
        best: number
        reads: number
}

export interface Tally {
        steps: number
        failures: Failure[]
        judged: Record<string, number>
        regions: Record<string, number>
        cost: Bill
        store: Record<string, number>
        unmeasured: Record<string, number>
}
