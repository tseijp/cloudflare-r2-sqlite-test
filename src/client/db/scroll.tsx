import { SQ } from './utils/share/const'
import { around, visibleRows } from './utils/slots/squares'
import { isInside } from './utils/slots/slots'
import { readView, readWin } from './tree'
import type { Scrolled } from './utils/events/events'
import type { Send, Tree } from './utils/share/types'

interface _Sheet {
        scrollTop: number
        clientHeight: number
}

export const createScroll = (tree: Tree, send: Send, sheet: { current: _Sheet | null }) => {
        let _last = ''
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
                        if (key === _last) return
                        _last = key
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
