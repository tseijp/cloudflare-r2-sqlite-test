import { HEAD } from './utils/share/const.ts'
import { offsets, rowsOf, squaresOf } from './utils/slots/squares.ts'
import { slotsOf } from './utils/slots/slots.ts'
import { readCols, readDeco, readEditing, readPages, readRow, readSel, readView, readWin } from './tree.ts'
import type { Tree } from './utils/share/types.ts'

export const readPaper = (tree: Tree, isMine: boolean) => {
        const _win = readWin(tree)
        const _view = readView(tree)
        const _slots = _win ? slotsOf(_win, _view) : []
        const _editing = isMine ? readEditing(tree) : null
        const cols = _win ? readCols(tree, _win.page) : []
        const xs = offsets(cols)
        const _target = _editing ? cols[_editing.col] : undefined
        return {
                xs,
                cols,
                pages: readPages(tree),
                page: _win?.page,
                squares: squaresOf(cols),
                rows: rowsOf(_win, _view),
                sel: readSel(tree),
                field: _editing && _target ? { x: xs[_editing.col], y: _editing.row, w: _target.width, isHead: _editing.row === HEAD } : null,
                lines: (_win?.ids ?? []).map((id: any, i: any) => ({
                        id,
                        pos: _slots[i],
                        row: readRow(tree, id) ?? {},
                        deco: readDeco(tree, id),
                })),
        }
}
