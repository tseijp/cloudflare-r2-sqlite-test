import { REFRESH_KINDS } from './utils/share/const.ts'
import { isSame } from './utils/tree/tree.ts'
import { decoAt } from './deco.ts'
import { inWindow, readRow } from './row.ts'
import type { CellOp, ClearOp, ColRenameOp, Op, StyleOp } from '../utils/share/types.ts'
import type { Ctx, Step } from './utils/share/types.ts'

const _stepOf = (apply: Op[], revert: Op[], rows: number[]): Step => ({ apply, revert, rows, item: null })

const _captureLayout = () => _stepOf([], [], [])

const _captureNone = () => null

const _CAPTURE: Record<Op['kind'], (ctx: Ctx, op: any) => Step | null> = {
        cell: ({ tree }: Ctx, op: CellOp) => {
                const row = readRow(tree, op.row)
                if (!row) return null
                const value = row[op.col] ?? null
                const marks = decoAt(tree, op.row).marks[op.col] ?? []
                const isKept = value === op.value && (!op.marks || isSame(marks, op.marks))
                if (isKept) return null
                const revert: CellOp = { kind: 'cell', page: op.page, row: op.row, col: op.col, value, ...(op.marks && { marks }) }
                return _stepOf([op], [revert], [op.row])
        },
        clear: ({ tree }: Ctx, op: ClearOp) => {
                const rows = inWindow(tree, op.rows)
                const cellsOf = (id: number) => {
                        const row = readRow(tree, id)!
                        const cols = op.cols.filter((col) => row[col] != null)
                        return cols.map((col): CellOp => ({ kind: 'cell', page: op.page, row: id, col, value: row[col] }))
                }
                const revert = rows.flatMap(cellsOf)
                if (!revert.length) return null
                return _stepOf([op], revert, rows)
        },
        style: ({ tree }: Ctx, op: StyleOp) => {
                if (!inWindow(tree, [op.row]).length) return null
                const json = decoAt(tree, op.row).styles[op.col] ?? null
                if (json === op.json) return null
                return _stepOf([op], [{ ...op, json }], [op.row])
        },
        'col.rename': (_: Ctx, op: ColRenameOp) => _stepOf([op], [{ kind: 'col.rename', page: op.page, from: op.to, to: op.from }], []),
        'col.add': _captureLayout,
        'col.hide': _captureLayout,
        'row.add': _captureNone,
        'row.remove': _captureNone,
}

export const capture = (ctx: Ctx, op: Op) => _CAPTURE[op.kind](ctx, op)

export const isRefresh = (op: Op) => (REFRESH_KINDS as readonly string[]).includes(op.kind)
