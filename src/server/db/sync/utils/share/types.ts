import type * as Y from 'yjs'
import type { ColType, Edited, Filter, Mark, Op, Order, Queried, Req, Row, Schema, Value } from '../../../utils/share/types.ts'

export type Tree = Y.Map<any>

export type Pair = [string, Value]

export type Side = 'undo' | 'redo'

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

export interface Run {
        query(req: Req): Promise<Queried>
        edit(op: Op): Promise<Edited>
        schema(): Promise<Schema[]>
}

export interface ColDecl {
        name: string
        type: ColType
        width?: number
        options?: string[]
        pos?: number
        hidden?: boolean
}

export interface PageDecl {
        id: string
        name: string
        pos?: number
        cols: ColDecl[]
}

export interface Layout {
        declare(page: PageDecl): void
        pages(): Page[]
        cols(pid: string): Col[]
        find(pid: string, name: string): Col | undefined
        snapshot(): Uint8Array
        load(bytes: Uint8Array): void
}

export interface Step {
        apply: Op[]
        revert: Op[]
        rows: number[]
        item: unknown
}

export interface Ctx {
        tree: Tree
        layout: Layout
}

export interface Dump {
        pages: (Page & { cols: Col[] })[]
        win: Win | null
        rows: (Row & { deco: Deco | null })[]
        sel: unknown
        editing: unknown
        view: View | null
}

export interface Window {
        move(req: Req): Promise<void>
        act(op: Op): Promise<Edited>
        dump(): Dump
        undo(): Promise<void>
        redo(): Promise<void>
        layout: Layout
}

export interface History {
        record(step: Step | null, write: () => void): void
        peek(side: Side): Step | null
        flip(side: Side, write: () => void): void
        prune(ids: number[]): void
}
