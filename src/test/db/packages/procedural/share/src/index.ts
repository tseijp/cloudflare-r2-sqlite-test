export type Step = [kind: string, ...args: any[]]

export type Operand = string | number | boolean | null | Operand[]

export type Code = [code: string, ...operand: Operand[]]

export type Send = (request: any[]) => Promise<any>

export interface Consts {
        PAGE: number
        CHUNK: number
        ROOM: number
        LIMIT: number
        SWAP: number
        SLOTS: number
        ROWS: number
}

export interface Stat {
        pages: number
        base: number
        dirty: number
        deltas: number
        patch: number
}

export interface Facts {
        K: Consts
        reg: Record<string, any>
        nodes: Record<string, { stat: Stat; save: string }>
        alive: string[]
        isArmed: boolean
        held: string | null
}

export interface Fail {
        axis: string
        note: string
        known: string
        at: number
}

export interface Count {
        pass: number
        fail: number
        known: number
}

export interface Report {
        title: string
        steps: number
        axes: Record<string, Count>
        fails: Fail[]
        regions: Record<string, number>
        marks: Record<string, number>
        cost: Record<string, number>
        store: Record<string, number>
        notes: string[]
}

export const MAIN = 'main'

export const PROBE = 'P'

export const BUILD = 'S'

export const twinOf = (node: string) => `${node}'`

export const SHAPES: Record<string, [on: string, method: string]> = {
        open: ['node', 'open'],
        stop: ['node', 'stop'],
        run: ['node', 'run'],
        save: ['node', 'save'],
        push: ['node', 'push'],
        merge: ['node', 'merge'],
        exec: ['node', 'exec'],
        fill: ['node', 'fill'],
        load: ['node', 'load'],
        peek: ['node', 'peek'],
        stat: ['node', 'stat'],
        audit: ['node', 'audit'],
        expect: ['node', 'expect'],
        fail: ['store', 'fail'],
        hold: ['store', 'hold'],
        release: ['store', 'release'],
        copy: ['store', 'copy'],
        paste: ['store', 'paste'],
        see: ['store', 'expect'],
        state: ['t', 'state'],
        tick: ['t', 'tick'],
        policy: ['t', 'policy'],
        note: ['t', 'note'],
        mark: ['t', 'mark'],
}
