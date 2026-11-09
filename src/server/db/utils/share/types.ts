import type * as Y from 'yjs'

export type MaybePromise<T> = T | Promise<T>

export type ColType = 'text' | 'number' | 'int' | 'bool' | 'date' | 'datetime' | 'json'

export type Value = string | number | null

export type Row = Record<string, Value>

export interface Mark {
        from: number
        to: number
        attr: string
        val: string
}

export interface CellOp {
        kind: 'cell'
        page: string
        row: number
        col: string
        value: Value
        marks?: Mark[]
}

export interface ClearOp {
        kind: 'clear'
        page: string
        rows: number[]
        cols: string[]
}

export interface RowAddOp {
        kind: 'row.add'
        page: string
        values?: Row
}

export interface RowRemoveOp {
        kind: 'row.remove'
        page: string
        row: number
}

export interface ColAddOp {
        kind: 'col.add'
        page: string
        name: string
        type: ColType
        width: number
}

export interface ColRenameOp {
        kind: 'col.rename'
        page: string
        from: string
        to: string
}

export interface ColHideOp {
        kind: 'col.hide'
        page: string
        name: string
}

export interface StyleOp {
        kind: 'style'
        page: string
        row: number
        col: string
        json: string | null
}

export type Op = CellOp | ClearOp | RowAddOp | RowRemoveOp | ColAddOp | ColRenameOp | ColHideOp | StyleOp

export interface Order {
        col: string
        dir: 'asc' | 'desc'
}

export interface Filter {
        col: string
        value: Value
}

export interface Req {
        page: string
        from: number
        to: number
        order?: Order
        filter?: Filter
        search?: string
}

export interface StyleRow {
        row: number
        col: string
        json: string
}

export interface MarkRow extends Mark {
        row: number
        col: string
}

export interface Queried {
        cols: string[]
        rows: Value[][]
        styles: StyleRow[]
        marks: MarkRow[]
}

export interface Frame {
        txid: number
        pgno: number
        data: Uint8Array
        commit: number
}

export interface Edited {
        txid: number
        frames: Frame[]
}

export interface PutOptions {
        ifNoneMatch?: boolean
        etagMatches?: string
}

export type GetRange = { offset: number; length: number } | { suffix: number }

export interface Storage {
        put(key: string, bytes: Uint8Array, opts?: PutOptions): MaybePromise<{ etag: string } | null>
        get(key: string, range: GetRange): MaybePromise<Uint8Array | null>
        head(key: string): MaybePromise<{ size: number; etag: string } | null>
        list(prefix: string): MaybePromise<{ key: string; size: number }[]>
        delete(keys: string[]): MaybePromise<void>
}

export interface Column {
        name: string
        type: ColType
        default?: Value
        optional?: boolean
}

export interface Sheet {
        name: string
        columns: Column[]
}

export interface Described {
        name: string
        type: ColType
        default: Value
        optional: boolean
}

export interface Schema {
        page: string
        columns: Described[]
        rows: number
}

export interface Result {
        rows: Row[]
        changes: number
}

export interface Meta {
        get(key: string): Uint8Array | null
        set(key: string, bytes: Uint8Array): void
}

export interface Image {
        sql(text: string, params?: Value[] | Row): Result
        declare(page: Sheet): Edited
        window(req: Req): Queried
        edit(op: Op): Edited
        frames(since: number): Frame[]
        readonly txid: number
        checkpoint(): void
        bytes(): Uint8Array
        pageSize: number
        orphans(): number
        schema(): Schema[]
        meta: Meta
        close(): void
}

export interface Input {
        bytes?: Uint8Array | null
        storage?: Storage
        doc?: Y.Doc
        txid?: number
}
