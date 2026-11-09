import type * as Y from 'yjs'

export type ColType = 'text' | 'number' | 'int' | 'bool' | 'date' | 'datetime' | 'json'

export type Value = string | number | null

export type Row = Record<string, Value>

export type Tree = Y.Map<any>

export type Pair = [string, Value]

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

export interface View {
        order?: Order
        filter?: Filter
        search?: string
}

export interface Page {
        id: string
        name: string
        pos: number
}

export interface Col {
        id: string
        name: string
        type: ColType
        width: number
        options: string[]
        pos: number
        hidden: boolean
}

export interface Win {
        page: string
        from: number
        to: number
        ids: number[]
}

export interface Deco {
        styles: Record<string, string>
        marks: Record<string, Mark[]>
}

export interface Sel {
        page: string
        row: number
        col: number
        row2: number
        col2: number
}

export interface Editing {
        page: string
        row: number
        col: number
}

export interface Range {
        from: number
        to: number
}

export interface Cell {
        row: number
        col: number
}

export interface Send {
        act(op: Op): Promise<unknown>
        move(req: Req): Promise<unknown>
}

export interface Provider {
        on(name: string, fn: (...args: any[]) => void): void
        off(name: string, fn: (...args: any[]) => void): void
}
