import { HEAD } from './utils/share/const'
import { clamp } from './utils/slots/squares'
import { idAt, stepOf } from './utils/slots/slots'
import { readCols, readRow, readSel, readView, readWin, writeEditing, writeSel } from './tree'
import { format } from './utils/value/value'
import type { Cell, Editing, Tree, Win } from './utils/share/types'

export const createGesture = (tree: Tree, reveal: (row: number) => void) => {
        let _seed = ''
        let _target: Editing | null = null
        const place = (win: Win, cell: Cell, isExtend: boolean) => {
                const prev = readSel(tree)
                const base = isExtend && prev ? prev : cell
                writeSel(tree, { page: win.page, row: base.row, col: base.col, row2: cell.row, col2: cell.col })
                reveal(cell.row)
        }
        return {
                place,
                step: (dr: number, dc: number, isExtend: boolean) => {
                        const sel = readSel(tree)
                        const win = readWin(tree)
                        if (!sel || !win) return
                        const row = stepOf(win, readView(tree), sel.row2, dr)
                        const col = clamp(sel.col2 + dc, 0, readCols(tree, win.page).length - 1)
                        place(win, { row, col }, isExtend)
                },
                start: (text?: string, at?: Cell) => {
                        const sel = readSel(tree)
                        const win = readWin(tree)
                        const cell = at ?? (sel && { row: sel.row2, col: sel.col2 })
                        const col = win && cell && readCols(tree, win.page)[cell.col]
                        if (!win || !cell || !col) return
                        const isHead = cell.row === HEAD
                        const id = idAt(win, readView(tree), cell.row)
                        if (!isHead && id === undefined) return
                        _seed = text ?? format(isHead ? col.name : readRow(tree, id)?.[col.name])
                        _target = { page: win.page, row: cell.row, col: cell.col }
                        writeEditing(tree, _target)
                },
                stop: () => {
                        _target = null
                        writeEditing(tree, null)
                },
                seed: () => _seed,
                target: () => _target,
                isMine: () => !!_target,
        }
}
