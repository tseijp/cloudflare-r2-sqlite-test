import type { View, Win } from '../share/types'

const _startOf = (win: Win) => Math.max(1, win.from)

const _isScan = (view: View) => !!(view.order || view.filter || view.search)

export const slotsOf = (win: Win, view: View) => (_isScan(view) ? win.ids.map((_, i) => _startOf(win) + i) : win.ids)
export const idAt = (win: Win, view: View, pos: number): number | undefined => win.ids[slotsOf(win, view).indexOf(pos)]

export const lastPos = (win: Win, view: View) => slotsOf(win, view)[win.ids.length - 1] ?? _startOf(win)

export const isEnd = (win: Win, view: View) => {
        if (_isScan(view)) return win.ids.length < win.to - _startOf(win) + 1
        return (win.ids[win.ids.length - 1] ?? 0) < win.to
}

export const isInside = (win: Win, from: number, to: number, view: View) => from >= _startOf(win) && (to <= win.to || isEnd(win, view))
export const stepOf = (win: Win, view: View, pos: number, dr: number) => {
        const slots = slotsOf(win, view)
        const i = slots.findIndex((slot) => slot >= pos)
        const at = i < 0 ? slots.length - 1 : i
        return slots[Math.min(Math.max(at + dr, 0), slots.length - 1)] ?? pos
}
