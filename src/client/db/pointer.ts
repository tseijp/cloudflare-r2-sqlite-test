import { HEAD } from './utils/share/const.ts'
import { readSel, readWin } from './tree.ts'
import type { Pointer, Target } from './utils/events/events.ts'
import type { Cell, Tree, Win } from './utils/share/types.ts'

type _Hit = Cell & { kind: 'cell' | 'head' | 'sort' | 'width' }

interface _Parts {
        gesture: { place(win: Win, cell: Cell, isExtend: boolean): void; start(text?: string, at?: Cell): void; isMine(): boolean }
        commit: { sort(index: number): unknown }
        resize: { start(index: number, x: number): void; move(x: number): void; end(): void; isDragging(): boolean }
}

const _hitOf = (target: Pointer['target']): _Hit | null => {
        const node = target as Target | null
        const el = node?.closest?.('[data-r]')
        if (!node || !el) return null
        const cell = { row: Number(el.dataset.r), col: Number(el.dataset.c) }
        if (node.closest('[data-w]')) return { ...cell, kind: 'width' }
        if (node.closest('[data-sort]')) return { ...cell, kind: 'sort' }
        return { ...cell, kind: cell.row === HEAD ? 'head' : 'cell' }
}

export const createPointer = (tree: Tree, { gesture, commit, resize }: _Parts) => {
        return {
                onMouseDown: (e: Pointer) => {
                        const hit = _hitOf(e.target)
                        const win = readWin(tree)
                        if (!hit || !win) return
                        if (hit.kind !== 'cell' && gesture.isMine()) return
                        if (hit.kind === 'width') return resize.start(hit.col, e.clientX)
                        if (hit.kind === 'sort') return void commit.sort(hit.col)
                        if (hit.kind === 'head') return gesture.start(undefined, hit)
                        gesture.place(win, hit, e.shiftKey)
                },
                onMouseOver: (e: Pointer) => {
                        const hit = _hitOf(e.target)
                        const win = readWin(tree)
                        const isDrag = e.buttons === 1 && !resize.isDragging() && hit?.kind === 'cell' && !!readSel(tree)
                        if (!isDrag || !win || !hit) return
                        gesture.place(win, hit, true)
                },
                onMouseMove: (e: Pointer) => {
                        if (resize.isDragging()) resize.move(e.clientX)
                },
                onMouseUp: () => resize.end(),
        }
}
