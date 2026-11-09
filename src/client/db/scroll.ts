import { SQ } from './utils/share/const.ts'
import { around, visibleRows } from './utils/slots/squares.ts'
import { isInside } from './utils/slots/slots.ts'
import { readView, readWin } from './tree.ts'
import type { Scrolled } from './utils/events/events.ts'
import type { Send, Tree } from './utils/share/types.ts'

interface Sheet {
        scrollTop: number
        clientHeight: number
}

export const createScroll = (tree: Tree, send: Send, sheet: { current: Sheet | null }) => {
        let last = ''
        return {
                onScroll: (e: Scrolled) => {
                        const el = e.currentTarget
                        const win = readWin(tree)
                        if (!win) return
                        const view = readView(tree)
                        const vis = visibleRows(el.scrollTop, el.clientHeight - SQ * 2)
                        if (isInside(win, vis.from, vis.to, view)) return
                        const range = around(vis)
                        const key = `${win.page}:${range.from}:${range.to}`
                        if (key === last) return
                        last = key
                        send.move({ ...view, page: win.page, ...range })
                },
                reveal: (row: number) => {
                        const el = sheet.current
                        if (!el) return
                        const top = (row - 1) * SQ
                        const bottom = top + SQ * 3 - el.clientHeight
                        if (top < el.scrollTop) el.scrollTop = top
                        if (bottom > el.scrollTop) el.scrollTop = bottom
                },
        }
}
