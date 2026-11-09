import { widthAt } from './utils/slots/squares.ts'
import { readCols, readWin, writeWidth } from './tree.ts'
import type { Tree } from './utils/share/types.ts'

interface Drag {
        page: string
        id: string
        width: number
        x: number
}

export const createResize = (tree: Tree) => {
        let drag: Drag | null = null
        const start = (index: number, x: number) => {
                const win = readWin(tree)
                const col = win && readCols(tree, win.page)[index]
                if (!win || !col) return
                drag = { page: win.page, id: col.id, width: col.width, x }
        }
        const move = (x: number) => {
                const col = drag && readCols(tree, drag.page, true).find((c) => c.id === drag!.id)
                if (!drag || !col) return
                writeWidth(tree, drag.page, col, widthAt(drag.width, x - drag.x))
        }
        const end = () => void (drag = null)
        return { start, move, end, isDragging: () => !!drag }
}
