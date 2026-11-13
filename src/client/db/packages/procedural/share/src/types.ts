import type * as Y from 'yjs'

export interface Input {
        doc: Y.Doc
        id: string
        send: (op: object) => Promise<any>
}

export interface Edit {
        text: string
        marks: any[][]
        start: number
        stop: number
}

export interface State {
        page: string
        top: number
        sel: [slot: number, index: number] | null
        edit: Edit | null
        result: any[][] | null
        note: string
}

export interface Snap extends State {
        id: string
        pages: string[]
        cols: [name: string, width: number][]
        rows: any[][]
        styles: Record<string, string>
        marks: Record<string, any[][]>
        last: number
}

export interface Event {
        type: string
        [key: string]: any
}

export type Code = [code: 'state', patch: Partial<State>] | [code: 'send', op: Event, key?: string]

export type Dispatch = (event: Event) => boolean
