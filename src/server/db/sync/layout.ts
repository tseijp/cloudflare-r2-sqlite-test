import * as Y from 'yjs'
import { ORIGIN, TREE } from './utils/share/const.ts'
import { colKey, isColKey, isLayoutKey, isPageKey, pageKey } from './utils/keys/keys.ts'
import { byPos, keysOf, put, uid } from './utils/tree/tree.ts'
import { WIDTH } from './config.ts'
import type { Col, ColDecl, Layout, Page, PageDecl, Tree } from './utils/share/types.ts'

const declarePage = (tree: Tree, page: PageDecl) => {
        const old = tree.get(pageKey(page.id)) as Page | undefined
        put(tree, pageKey(page.id), { id: page.id, name: page.name, pos: page.pos ?? old?.pos ?? 0 })
}

const declareCol = (tree: Tree, pid: string, decl: ColDecl, i: number, cols: Col[]) => {
        const old = cols.find((col) => col.name === decl.name)
        const id = old?.id ?? uid()
        const width = decl.width ?? old?.width ?? (WIDTH as any)[decl.type] ?? WIDTH.text
        const options = decl.options ?? old?.options ?? []
        const pos = decl.pos ?? old?.pos ?? i
        const hidden = decl.hidden ?? old?.hidden ?? false
        put(tree, colKey(pid, id), { id, name: decl.name, type: decl.type, width, options, pos, hidden })
}

const dropCols = (tree: Tree, pid: string, decls: ColDecl[], cols: Col[]) => {
        const names = new Set(decls.map((decl) => decl.name))
        cols.filter((col) => !names.has(col.name)).forEach((col) => tree.delete(colKey(pid, col.id)))
}

export const createLayout = (doc: Y.Doc, tree: Tree): Layout => {
        const pages = () =>
                keysOf(tree, isPageKey)
                        .map((key) => tree.get(key) as Page)
                        .sort(byPos)
        const cols = (pid: string) =>
                keysOf(tree, isColKey(pid))
                        .map((key) => tree.get(key) as Col)
                        .sort(byPos)
        const find = (pid: string, name: string) => cols(pid).find((col) => col.name === name)
        const declareAll = (page: PageDecl) => {
                const old = cols(page.id)
                declarePage(tree, page)
                page.cols.forEach((decl, i) => declareCol(tree, page.id, decl, i, old))
                dropCols(tree, page.id, page.cols, old)
        }
        const declare = (page: PageDecl) => doc.transact(() => declareAll(page), ORIGIN.win)
        const snapshot = () => {
                const copy = new Y.Doc()
                const map = copy.getMap(TREE)
                keysOf(tree, isLayoutKey).forEach((key) => map.set(key, tree.get(key)))
                return Y.encodeStateAsUpdate(copy)
        }
        const load = (bytes: Uint8Array) => Y.applyUpdate(doc, bytes, ORIGIN.win)
        return { declare, pages, cols, find, snapshot, load }
}
