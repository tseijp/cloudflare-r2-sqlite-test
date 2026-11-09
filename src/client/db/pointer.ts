import { HEAD } from './utils/const/const.ts'
import { readSel, readWin } from './tree.ts'
import type { Pointer, Target } from './utils/events/events.ts'
import type { Cell, Tree, Win } from './utils/types/types.ts'

type Hit = Cell & { kind: 'cell' | 'head' | 'sort' | 'width' }

interface Parts {
        gesture: { place(win: Win, cell: Cell, isExtend: boolean): void; start(text?: string, at?: Cell): void; isMine(): boolean }
        commit: { sort(index: number): unknown }
        resize: { start(index: number, x: number): void; move(x: number): void; end(): void; isDragging(): boolean }
}

const hitOf = (target: Pointer['target']): Hit | null => {
        const node = target as Target | null
        const el = node?.closest?.('[data-r]')
        if (!node || !el) return null
        const cell = { row: Number(el.dataset.r), col: Number(el.dataset.c) }
        if (node.closest('[data-w]')) return { ...cell, kind: 'width' }
        if (node.closest('[data-sort]')) return { ...cell, kind: 'sort' }
        return { ...cell, kind: cell.row === HEAD ? 'head' : 'cell' }
}

export const createPointer = (tree: Tree, { gesture, commit, resize }: Parts) => {
        const onMouseDown = (e: Pointer) => {
                const hit = hitOf(e.target)
                const win = readWin(tree)
                if (!hit || !win) return
                if (hit.kind !== 'cell' && gesture.isMine()) return
                if (hit.kind === 'width') return resize.start(hit.col, e.clientX)
                if (hit.kind === 'sort') return void commit.sort(hit.col)
                if (hit.kind === 'head') return gesture.start(undefined, hit)
                gesture.place(win, hit, e.shiftKey)
        }
        const onMouseOver = (e: Pointer) => {
                const hit = hitOf(e.target)
                const win = readWin(tree)
                const isDrag = e.buttons === 1 && !resize.isDragging() && hit?.kind === 'cell' && !!readSel(tree)
                if (!isDrag || !win || !hit) return
                gesture.place(win, hit, true)
        }
        const onMouseMove = (e: Pointer) => {
                if (resize.isDragging()) resize.move(e.clientX)
        }
        const onMouseUp = () => resize.end()
        return { onMouseDown, onMouseOver, onMouseMove, onMouseUp }
}
