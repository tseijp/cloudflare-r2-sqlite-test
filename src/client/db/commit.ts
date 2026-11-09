import { HEAD, WINDOW } from './utils/share/const.ts'
import { NEW_COL } from './utils/share/config.ts'
import { span } from './utils/slots/squares.ts'
import { idAt } from './utils/slots/slots.ts'
import { readCols, readDeco, readRow, readSel, readView, readWin } from './tree.ts'
import { fitMarks, isSame, parse } from './utils/value/value.ts'
import type { Col, Editing, Order, Send, Tree, Win } from './utils/share/types.ts'

const _nextOrder = (prev: Order | undefined, col: string): Order | undefined => {
        if (prev?.col !== col) return { col, dir: 'asc' }
        if (prev.dir === 'asc') return { col, dir: 'desc' }
        return undefined
}

const _freeName = (cols: Col[]) => {
        const names = new Set(cols.map((col) => col.name))
        let n = cols.length + 1
        while (names.has(`列${n}`)) n++
        return `列${n}`
}

export const createCommit = (tree: Tree, send: Send) => {
        const _rename = (win: Win, col: Col, text: string) => {
                const to = text.trim()
                const isSkip = !to || to === col.name || readCols(tree, win.page, true).some((c) => c.name === to)
                if (isSkip) return
                return send.act({ kind: 'col.rename', page: win.page, from: col.name, to })
        }
        const _write = (win: Win, col: Col, editing: Editing, text: string) => {
                const id = idAt(win, readView(tree), editing.row)
                if (id === undefined) return
                const value = parse(col.type, text)
                if (isSame(readRow(tree, id)?.[col.name], value)) return
                const marks = readDeco(tree, id)?.marks[col.name]
                const fit = marks && { marks: fitMarks(marks, String(value ?? '').length) }
                return send.act({ kind: 'cell', page: win.page, row: id, col: col.name, value, ...fit })
        }
        const open = (pid: string) => send.move({ page: pid, from: 1, to: WINDOW })
        return {
                confirm: (editing: Editing | null, text: string) => {
                        const win = readWin(tree)
                        const col = win && editing && readCols(tree, win.page)[editing.col]
                        if (!editing || !win || !col || editing.page !== win.page) return
                        if (editing.row === HEAD) return _rename(win, col, text)
                        return _write(win, col, editing, text)
                },
                clear: () => {
                        const sel = readSel(tree)
                        const win = readWin(tree)
                        if (!sel || !win) return
                        const [r1, r2] = span(sel.row, sel.row2)
                        const [c1, c2] = span(sel.col, sel.col2)
                        const view = readView(tree)
                        const ids = Array.from({ length: r2 - r1 + 1 }, (_, i) => idAt(win, view, r1 + i))
                        const rows = ids.filter((id): id is number => id !== undefined)
                        const cols = readCols(tree, win.page)
                                .slice(c1, c2 + 1)
                                .map((col) => col.name)
                        if (!rows.length || !cols.length) return
                        return send.act({ kind: 'clear', page: win.page, rows, cols })
                },
                toggle: () => {
                        const sel = readSel(tree)
                        const win = readWin(tree)
                        const col = win && sel && readCols(tree, win.page)[sel.col2]
                        const id = win && sel ? idAt(win, readView(tree), sel.row2) : undefined
                        if (!win || col?.type !== 'bool' || id === undefined) return
                        const value = readRow(tree, id)?.[col.name] ? 0 : 1
                        return send.act({ kind: 'cell', page: win.page, row: id, col: col.name, value })
                },
                addRow: () => {
                        const win = readWin(tree)
                        if (!win) return
                        return send.act({ kind: 'row.add', page: win.page })
                },
                addCol: () => {
                        const win = readWin(tree)
                        if (!win) return
                        const name = _freeName(readCols(tree, win.page, true))
                        return send.act({ kind: 'col.add', page: win.page, name, type: NEW_COL.type, width: NEW_COL.width })
                },
                sort: (index: number) => {
                        const win = readWin(tree)
                        const col = win && readCols(tree, win.page)[index]
                        if (!win || !col) return
                        const view = readView(tree)
                        return send.move({ ...view, page: win.page, from: 1, to: WINDOW, order: _nextOrder(view.order, col.name) })
                },
                open,
        }
}
