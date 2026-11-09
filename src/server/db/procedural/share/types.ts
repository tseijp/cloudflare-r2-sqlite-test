import type * as Y from 'yjs'

export type Value = string | number | null

export type Row = Record<string, Value>

export type ColType = 'text' | 'number' | 'int' | 'bool' | 'date' | 'datetime' | 'json'

export interface Mark {
        from: number
        to: number
        attr: string
        val: string
}

export interface ColDecl {
        name: string
        type: ColType
        width?: number
        default?: Value
        optional?: boolean
        options?: string[]
        hidden?: boolean
        pos?: number
}

export interface Col {
        name: string
        type: ColType
        width: number
        pos: number
        hidden: boolean
        options: string[]
}

export interface Page {
        name: string
        pos: number
        cols: Col[]
}

export interface Cell {
        row: number
        col: string
        value?: Value
        marks?: Mark[]
}

export interface Paint {
        row: number
        col: string
        json: string | null
}

export interface ColSet {
        name: string
        to?: string
        type?: ColType
        width?: number
        hidden?: boolean
        options?: string[]
        pos?: number
}

export type Op =
        | { kind: 'cells'; page: string; cells: Cell[] }
        | { kind: 'style'; page: string; cells: Paint[] }
        | { kind: 'row.add'; page: string; id?: number; values?: Row }
        | { kind: 'row.remove'; page: string; rows: number[] }
        | ({ kind: 'col.add'; page: string } & ColDecl)
        | ({ kind: 'col.set'; page: string } & ColSet)
        | { kind: 'col.remove'; page: string; name: string }
        | { kind: 'page.add'; name: string; cols?: ColDecl[] }

export interface View {
        order?: { col: string; dir: 'asc' | 'desc' }
        filter?: { col: string; value: Value }
        search?: string
}

export interface Req extends View {
        page: string
        from: number
        to: number
}

export interface Win extends Req {
        rows: number
        ids: number[]
}

export interface Deco {
        s?: Record<string, string>
        m?: Record<string, Mark[]>
}

export interface Shown {
        win: Win
        rows: Map<number, Value[]>
        deco: Map<number, Deco>
}

export interface Sheet {
        name: string
        rows: string[][]
}

export interface Result {
        cols: string[]
        rows: Value[][]
        changes: number
}

export type Q = (text: string, params?: Value[], limit?: number) => Promise<Result>

export interface Ctx {
        db: any
        tables: { col: any; style: any; mark: any }
        pages: Page[]
}

export interface Done {
        undo: Op[]
        id?: Value
        isLayout?: boolean
}

export interface Described {
        name: string
        type: ColType
        default: Value
        optional: boolean
}

export interface Schema {
        page: string
        rows: number
        columns: Described[]
}

export type Range = { offset: number; length: number } | { suffix: number }

export interface Storage {
        put(key: string, bytes: Uint8Array, opts?: { ifNoneMatch?: boolean }): Promise<{ etag: string } | null>
        get(key: string, range?: Range): Promise<Uint8Array | null>
        list(prefix: string): Promise<{ key: string; size: number }[]>
        delete(keys: string[]): Promise<void>
}

export type Load = (pgnos: number[] | null, has: (pgno: number) => boolean) => Promise<[number, Uint8Array][]>

export interface Source {
        pageSize: number
        commit: number
        load: Load
}

export interface Dirty {
        pageSize: number
        commit: number
        pages: [number, Uint8Array][]
}

export interface Pack {
        key: string
        size: number
        txid: number
        isFull: boolean
}

export interface Slot {
        key: string
        offset: number
}

export interface Paged {
        pages: Map<number, Uint8Array>
        size: number
        pageSize: number
        miss: Set<number>
}

export interface Flat {
        data: Uint8Array
        size: number
        onReset?: () => void
}

export type File = Paged | Flat

export interface Input {
        storage?: Storage
        doc?: Y.Doc
        prefix?: string
        wasm?: WebAssembly.Module
}
