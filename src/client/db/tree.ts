import { KEY } from './utils/const/const.ts'
import { colKey, decoKey, isColKey, isPageKey, rowKey } from './utils/keys/keys.ts'
import type * as Y from 'yjs'
import type { Col, Deco, Editing, Page, Pair, Row, Sel, Tree, View, Win } from './utils/types/types.ts'

const byPos = <T extends { pos: number }>(a: T, b: T) => a.pos - b.pos

const keysOf = (tree: Tree, isMatch: (key: string) => boolean) => [...tree.keys()].filter(isMatch)

export const readPages = (tree: Tree): Page[] =>
        keysOf(tree, isPageKey)
                .map((key) => tree.get(key))
                .sort(byPos)

export const readCols = (tree: Tree, pid: string, isAll = false): Col[] => {
        const cols = keysOf(tree, isColKey(pid)).map((key) => tree.get(key) as Col)
        return cols.filter((col) => isAll || !col.hidden).sort(byPos)
}

export const readWin = (tree: Tree): Win | null => tree.get(KEY.win) ?? null

export const readView = (tree: Tree): View => tree.get(KEY.view) ?? {}

export const readRow = (tree: Tree, id: number | undefined): Row | undefined => {
        const pairs = id === undefined ? undefined : (tree.get(rowKey(id)) as Y.Array<Pair> | undefined)
        if (!pairs) return
        return Object.fromEntries(pairs.toArray())
}

export const readDeco = (tree: Tree, id: number): Deco | undefined => tree.get(decoKey(id))

export const readSel = (tree: Tree): Sel | null => tree.get(KEY.sel) ?? null

export const readEditing = (tree: Tree): Editing | null => tree.get(KEY.editing) ?? null

export const writeSel = (tree: Tree, sel: Sel) => tree.set(KEY.sel, sel)

export const writeEditing = (tree: Tree, editing: Editing | null) => {
        if (!editing) return tree.delete(KEY.editing)
        tree.set(KEY.editing, editing)
}

export const writeWidth = (tree: Tree, pid: string, col: Col, width: number) => {
        if (col.width === width) return
        tree.set(colKey(pid, col.id), { ...col, width })
}

export const createStore = (tree: Tree) => {
        let tick = 0
        const subscribe = (notify: () => void) => {
                const bump = () => {
                        tick++
                        notify()
                }
                tree.observeDeep(bump)
                return () => tree.unobserveDeep(bump)
        }
        const get = () => tick
        return { subscribe, get }
}
