export type Code = [string, ...unknown[]]

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

// scenario 1 つの記録。@test/server の done が返し、scenario が default export する値
export interface Tally {
        steps: number
        failures: Failure[]
        judged: Record<string, number>
        regions: Record<string, number>
        cost: Bill
        store: Record<string, number>
        unmeasured: Record<string, number>
}

// scenario を 1 回走らせた結果。send が返す値
export interface Result {
        file: string
        tally: Tally | null
        limit: number
        code: number
        seconds: number
}

// seed 1 つの結果。fail は、縮めた scenario を書き出した file
export interface Run extends Result {
        seed: number
        fail: string
}

export interface Spec {
        type: string
        [field: string]: unknown
}

// scenario の file を @test/server で走らせる道。入口が渡す
export interface Input {
        send(file: string): Promise<Result>
}
