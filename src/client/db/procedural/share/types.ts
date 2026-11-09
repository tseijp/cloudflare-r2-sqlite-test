export type Value = string | number | null

export type ColType = 'text' | 'number' | 'int' | 'bool' | 'date' | 'datetime' | 'json'

export interface Mark {
        from: number
        to: number
        attr: string
        val: string
}

export interface Col {
        name: string
        type: ColType
        width: number
        pos: number
        hidden: boolean
        options: string[]
}

export interface Field extends Col {
        at: number
}

export interface Page {
        name: string
        pos: number
        cols: Col[]
}

export interface Order {
        col: string
        dir: 'asc' | 'desc'
}

export interface Req {
        page: string
        from: number
        to: number
        order?: Order
        filter?: { col: string; value: Value }
        search?: string
        view?: string
}

export interface Win extends Req {
        rows: number
        ids: number[]
}

export interface Deco {
        s?: Record<string, string>
        m?: Record<string, Mark[]>
}

export interface Line {
        id: number
        pos: number
        values: Value[]
        deco?: Deco
}

export interface Sel {
        row: number
        col: number
        row2: number
        col2: number
}

export interface Edit {
        row: number
        col: number
        seed: string
}

export interface Ui {
        sel: Sel | null
        edit: Edit | null
        drag: { col: number; width: number } | null
}

export interface Run {
        text: string
        style: Record<string, string | number>
}

export type Op = { kind: string } & Record<string, unknown>

export interface Send {
        act(op: Op): Promise<any>
        move(req: Req): Promise<unknown>
        undo(): Promise<unknown>
        redo(): Promise<unknown>
        load(sheets: { name: string; rows: string[][] }[]): Promise<unknown>
}
