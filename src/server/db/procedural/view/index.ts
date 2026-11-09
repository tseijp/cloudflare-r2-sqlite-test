import * as Y from 'yjs'
import type { Deco, Page, Shown, Value, Win } from '../share/types'

const _isSame = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const _idOf = (key: string) => Number(key.slice(key.indexOf('/') + 1))

const _isRowKey = (key: string) => key.startsWith('row/') || key.startsWith('deco/')

const _swap = (list: Y.Array<Value>, i: number, value: Value) => {
        list.delete(i, 1)
        list.insert(i, [value])
}

const _patchRow = (tree: Y.Map<any>, id: number, values: Value[]) => {
        const list = tree.get(`row/${id}`) as Y.Array<Value> | undefined
        const isFresh = !list || list.length !== values.length
        if (isFresh) return void tree.set(`row/${id}`, Y.Array.from(values))
        for (const [i, value] of values.entries()) if (list.get(i) !== value) _swap(list, i, value)
}

const _patchDeco = (tree: Y.Map<any>, id: number, deco?: Deco) => {
        const isGone = !deco && tree.has(`deco/${id}`)
        if (isGone) return void tree.delete(`deco/${id}`)
        if (deco && !_isSame(tree.get(`deco/${id}`), deco)) tree.set(`deco/${id}`, deco)
}

export const viewsOf = (tree: Y.Map<any>) => [...tree.keys()].filter((key) => key.startsWith('win/')).map((key) => key.slice(4))

export const patchPages = (tree: Y.Map<any>, pages: Page[]) => {
        const keys = new Set(pages.map((page) => `page/${page.name}`))
        for (const key of [...tree.keys()]) if (key.startsWith('page/') && !keys.has(key)) tree.delete(key)
        for (const page of pages) if (!_isSame(tree.get(`page/${page.name}`), page)) tree.set(`page/${page.name}`, page)
}

export const patchView = (tree: Y.Map<any>, view: string, shown: Shown | null, extra: object) => {
        if (!shown) return void tree.delete(`win/${view}`)
        const win = { ...shown.win, ...extra }
        if (!_isSame(tree.get(`win/${view}`), win)) tree.set(`win/${view}`, win)
        for (const [id, values] of shown.rows) _patchRow(tree, id, values)
        for (const id of shown.rows.keys()) _patchDeco(tree, id, shown.deco.get(id))
}

export const pruneRows = (tree: Y.Map<any>) => {
        const kept = new Set(viewsOf(tree).flatMap((view) => (tree.get(`win/${view}`) as Win).ids))
        for (const key of [...tree.keys()]) if (_isRowKey(key) && !kept.has(_idOf(key))) tree.delete(key)
}

export const evictViews = (tree: Y.Map<any>, max: number) => {
        const views = viewsOf(tree).sort((a, b) => tree.get(`win/${a}`).seq - tree.get(`win/${b}`).seq)
        for (const view of views.slice(0, Math.max(0, views.length - max))) tree.delete(`win/${view}`)
}
