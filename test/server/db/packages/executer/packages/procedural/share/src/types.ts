import type { Code, Db, Made, Part, Stat, Store } from '@test/server-share'

// 模擬 store の呼び出し 1 回の記録
export interface Call {
        who: string
        op: string
        seq: number
        seqs: number[]
        offset: number
        length: number
        bytes: number
        tag: string
        hit: string
        done: string
        hold: boolean
}

export interface Depot {
        handle(who: string): Store
        copy(): Map<number, Part>
        paste(parts: Map<number, Part>, seqs?: number[]): void
}

export interface Outcome {
        ok: boolean
        held: boolean
        value: unknown
        error: string
}

// client 1 人の直前の編集。問い合わせは製品の fill の命令のもの
export interface Edit {
        key: string
        text: string
        params: unknown[]
        was: unknown
        now: unknown
        isGhost: boolean
        isUndone: boolean
}

export interface View {
        text: string
        params: unknown[]
        tags: string[]
}

// twin と観測用の instance。製品の instance と、その store
export interface Twin extends Made {
        depot: Depot
}

export interface Replica {
        name: string
        db: Db | null
        view: Made['view'] | null
        twin: Twin | null
        pending: Promise<Outcome> | null
        out: Outcome
        echo: Outcome | null
        codes: Code[] | null
        before: Stat
        at: number
        seen: number
        every: number
        edited: number
        unsaved: number
        writes: number
        isRolled: boolean
        isDoubt: boolean
        isSoiled: boolean
        isWrote: boolean
        views: Map<string, View>
        sizes: Map<string, number>
        edits: Map<string, Edit>
        slots: Record<string, unknown>
        types: Set<string>
}

// 装置が相手から受け取るもの。executer が、要る操作だけを渡す
export interface Roster {
        of(name: string): Replica
        names(): string[]
        boot(name: string): void
        kill(name: string): void
        seed(name: string): Promise<unknown>
}

export interface Shelf {
        log: Call[]
        shots: unknown[]
        list(): (string | number)[][]
        parked(who: string): Promise<void>
        isHolding(who: string): boolean
}

// 装置をまたぐ小さい状態。論理時計、同時に生きた instance の最大、命令を送った client
export interface World {
        clock: number
        most: number
        ids: Set<string>
}
