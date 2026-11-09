import type { View, Win } from '../types/types.ts'

const startOf = (win: Win) => Math.max(1, win.from)

const isScan = (view: View) => !!(view.order || view.filter || view.search)

export const slotsOf = (win: Win, view: View) => (isScan(view) ? win.ids.map((_, i) => startOf(win) + i) : win.ids)

export const idAt = (win: Win, view: View, pos: number): number | undefined => win.ids[slotsOf(win, view).indexOf(pos)]

export const lastPos = (win: Win, view: View) => slotsOf(win, view)[win.ids.length - 1] ?? startOf(win)

export const isEnd = (win: Win, view: View) => {
        if (isScan(view)) return win.ids.length < win.to - startOf(win) + 1
        return (win.ids[win.ids.length - 1] ?? 0) < win.to
}

export const isInside = (win: Win, from: number, to: number, view: View) => from >= startOf(win) && (to <= win.to || isEnd(win, view))

export const stepOf = (win: Win, view: View, pos: number, dr: number) => {
        const slots = slotsOf(win, view)
        const i = slots.findIndex((slot) => slot >= pos)
        const at = i < 0 ? slots.length - 1 : i
        return slots[Math.min(Math.max(at + dr, 0), slots.length - 1)] ?? pos
}
