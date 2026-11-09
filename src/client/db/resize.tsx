import { widthAt } from './utils/slots/squares'
import { readCols, readWin, writeWidth } from './tree'
import type { Tree } from './utils/share/types'

interface _Drag {
        page: string
        id: string
        width: number
        x: number
}

export const createResize = (tree: Tree) => {
        let _drag: _Drag | null = null
        return {
                start: (index: number, x: number) => {
                        const win = readWin(tree)
                        const col = win && readCols(tree, win.page)[index]
                        if (!win || !col) return
                        _drag = { page: win.page, id: col.id, width: col.width, x }
                },
                move: (x: number) => {
                        const col = _drag && readCols(tree, _drag.page, true).find((c) => c.id === _drag!.id)
                        if (!_drag || !col) return
                        writeWidth(tree, _drag.page, col, widthAt(_drag.width, x - _drag.x))
                },
                end: () => void (_drag = null),
                isDragging: () => !!_drag,
        }
}
