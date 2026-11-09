import { SQ, SQUARES, WIDTH, WINDOW } from './utils/const/const.ts'
import { isEnd, lastPos } from './utils/slots/slots.ts'
import type { Col, Range, Sel, View, Win } from './utils/types/types.ts'

export const offsets = (cols: Col[]) => cols.reduce((acc, col) => [...acc, acc[acc.length - 1] + col.width], [0])

export const squaresOf = (cols: Col[]) => Math.max(SQUARES, offsets(cols)[cols.length])

export const letterOf = (i: number): string => (i < 26 ? '' : letterOf(Math.floor(i / 26) - 1)) + String.fromCharCode(65 + (i % 26))

export const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi)

export const widthAt = (width: number, dx: number) => clamp(width + Math.round(dx / SQ), WIDTH.min, WIDTH.max)

export const span = (a: number, b: number) => [Math.min(a, b), Math.max(a, b)]

export const rowsOf = (win: Win | null, view: View) => {
        if (!win) return WINDOW
        if (isEnd(win, view)) return lastPos(win, view)
        return win.to + WINDOW
}

export const visibleRows = (scrollTop: number, height: number): Range => {
        const from = Math.floor(scrollTop / SQ) + 1
        const to = Math.max(from, Math.ceil((scrollTop + height) / SQ))
        return { from, to }
}

export const around = (vis: Range): Range => ({ from: Math.max(1, vis.from - WINDOW), to: vis.to + WINDOW })

export const rectOf = (sel: Sel, xs: number[]) => {
        const [r1, r2] = span(sel.row, sel.row2)
        const [c1, c2] = span(sel.col, sel.col2)
        return { left: xs[c1] * SQ, top: (r1 - 1) * SQ, width: (xs[c2 + 1] - xs[c1]) * SQ, height: (r2 - r1 + 1) * SQ }
}

export const box = (x: number, row: number, w: number) => ({ left: x * SQ, top: (row - 1) * SQ, width: w * SQ, height: SQ })
