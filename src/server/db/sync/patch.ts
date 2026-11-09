import { colKey } from './utils/keys/keys.ts'
import { put, uid } from './utils/tree/tree.ts'
import { decoAt, putDeco, without } from './deco.ts'
import { inWindow, writeCell } from './row.ts'
import type { CellOp, ClearOp, ColAddOp, ColHideOp, ColRenameOp, Op, StyleOp } from '../utils/share/types.ts'
import type { Ctx } from './utils/types/types.ts'

const patchCell = ({ tree }: Ctx, op: CellOp) => {
        if (!inWindow(tree, [op.row]).length) return
        writeCell(tree, op.row, op.col, op.value)
        if (!op.marks) return
        const deco = decoAt(tree, op.row)
        putDeco(tree, op.row, { ...deco, marks: without(deco.marks, op.col, op.marks.length ? op.marks : null) })
}

const patchClear = ({ tree }: Ctx, op: ClearOp) => {
        inWindow(tree, op.rows).forEach((id) => op.cols.forEach((col) => writeCell(tree, id, col, null)))
}

const patchStyle = ({ tree }: Ctx, op: StyleOp) => {
        if (!inWindow(tree, [op.row]).length) return
        const deco = decoAt(tree, op.row)
        putDeco(tree, op.row, { ...deco, styles: without(deco.styles, op.col, op.json) })
}

const patchColAdd = ({ tree, layout }: Ctx, op: ColAddOp) => {
        const cols = layout.cols(op.page)
        const pos = cols.length ? Math.max(...cols.map((col) => col.pos)) + 1 : 0
        const id = uid()
        put(tree, colKey(op.page, id), { id, name: op.name, type: op.type, width: op.width, options: [], pos, hidden: false })
}

const patchColRename = ({ tree, layout }: Ctx, op: ColRenameOp) => {
        const col = layout.find(op.page, op.from)
        if (col) put(tree, colKey(op.page, col.id), { ...col, name: op.to })
}

const patchColHide = ({ tree, layout }: Ctx, op: ColHideOp) => {
        const col = layout.find(op.page, op.name)
        if (col) put(tree, colKey(op.page, col.id), { ...col, hidden: true })
}

const PATCH: Record<Op['kind'], (ctx: Ctx, op: any) => void> = {
        cell: patchCell,
        clear: patchClear,
        style: patchStyle,
        'col.add': patchColAdd,
        'col.rename': patchColRename,
        'col.hide': patchColHide,
        'row.add': () => {},
        'row.remove': () => {},
}

export const patch = (ctx: Ctx, op: Op) => PATCH[op.kind](ctx, op)
