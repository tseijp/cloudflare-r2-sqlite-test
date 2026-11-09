import { REFRESH_KINDS } from './utils/const/const.ts'
import { isSame } from './utils/tree/tree.ts'
import { decoAt } from './deco.ts'
import { inWindow, readRow } from './row.ts'
import type { CellOp, ClearOp, ColRenameOp, Op, StyleOp } from '../utils/share/types.ts'
import type { Ctx, Step } from './utils/types/types.ts'

const stepOf = (apply: Op[], revert: Op[], rows: number[]): Step => ({ apply, revert, rows, item: null })

const captureCell = ({ tree }: Ctx, op: CellOp) => {
        const row = readRow(tree, op.row)
        if (!row) return null
        const value = row[op.col] ?? null
        const marks = decoAt(tree, op.row).marks[op.col] ?? []
        const isKept = value === op.value && (!op.marks || isSame(marks, op.marks))
        if (isKept) return null
        const revert: CellOp = { kind: 'cell', page: op.page, row: op.row, col: op.col, value, ...(op.marks && { marks }) }
        return stepOf([op], [revert], [op.row])
}

const captureClear = ({ tree }: Ctx, op: ClearOp) => {
        const rows = inWindow(tree, op.rows)
        const cellsOf = (id: number) => {
                const row = readRow(tree, id)!
                const cols = op.cols.filter((col) => row[col] != null)
                return cols.map((col): CellOp => ({ kind: 'cell', page: op.page, row: id, col, value: row[col] }))
        }
        const revert = rows.flatMap(cellsOf)
        if (!revert.length) return null
        return stepOf([op], revert, rows)
}

const captureStyle = ({ tree }: Ctx, op: StyleOp) => {
        if (!inWindow(tree, [op.row]).length) return null
        const json = decoAt(tree, op.row).styles[op.col] ?? null
        if (json === op.json) return null
        return stepOf([op], [{ ...op, json }], [op.row])
}

const captureColRename = (_: Ctx, op: ColRenameOp) => stepOf([op], [{ kind: 'col.rename', page: op.page, from: op.to, to: op.from }], [])

const captureLayout = () => stepOf([], [], [])

const captureNone = () => null

const CAPTURE: Record<Op['kind'], (ctx: Ctx, op: any) => Step | null> = {
        cell: captureCell,
        clear: captureClear,
        style: captureStyle,
        'col.add': captureLayout,
        'col.rename': captureColRename,
        'col.hide': captureLayout,
        'row.add': captureNone,
        'row.remove': captureNone,
}

export const capture = (ctx: Ctx, op: Op) => CAPTURE[op.kind](ctx, op)

export const isRefresh = (op: Op) => (REFRESH_KINDS as readonly string[]).includes(op.kind)
