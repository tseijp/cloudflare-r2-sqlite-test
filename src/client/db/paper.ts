import { HEAD } from './utils/const/const.ts'
import { offsets, rowsOf, squaresOf } from './squares.ts'
import { slotsOf } from './utils/slots/slots.ts'
import { readCols, readDeco, readEditing, readPages, readRow, readSel, readView, readWin } from './tree.ts'
import type { Tree } from './utils/types/types.ts'

export const readPaper = (tree: Tree, isMine: boolean) => {
        const win = readWin(tree)
        const view = readView(tree)
        const cols = win ? readCols(tree, win.page) : []
        const xs = offsets(cols)
        const slots = win ? slotsOf(win, view) : []
        const lines = (win?.ids ?? []).map((id: any, i: any) => ({ id, pos: slots[i], row: readRow(tree, id) ?? {}, deco: readDeco(tree, id) }))
        const editing = isMine ? readEditing(tree) : null
        const target = editing ? cols[editing.col] : undefined
        const field = editing && target ? { x: xs[editing.col], y: editing.row, w: target.width, isHead: editing.row === HEAD } : null
        return { pages: readPages(tree), page: win?.page, cols, xs, squares: squaresOf(cols), rows: rowsOf(win, view), sel: readSel(tree), field, lines }
}
