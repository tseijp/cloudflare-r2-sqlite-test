import * as Y from 'yjs'
import type { Page, Shown, Value } from '../share/types'

const _isSame = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const _idOf = (key: string, prefix: string) => (key.startsWith(prefix) ? Number(key.slice(prefix.length)) : NaN)

const _isStale = (key: string, shown: Shown | null) => {
        const row = _idOf(key, 'row/')
        const deco = _idOf(key, 'deco/')
        if (!Number.isNaN(row)) return !shown?.rows.has(row)
        if (!Number.isNaN(deco)) return !shown?.deco.has(deco)
        return false
}

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

export const patchPages = (tree: Y.Map<any>, pages: Page[]) => {
        const keys = new Set(pages.map((page) => `page/${page.name}`))
        for (const key of [...tree.keys()]) if (key.startsWith('page/') && !keys.has(key)) tree.delete(key)
        for (const page of pages) if (!_isSame(tree.get(`page/${page.name}`), page)) tree.set(`page/${page.name}`, page)
}

export const patchShown = (tree: Y.Map<any>, shown: Shown | null) => {
        for (const key of [...tree.keys()]) if (_isStale(key, shown)) tree.delete(key)
        if (!shown) return void tree.delete('win')
        if (!_isSame(tree.get('win'), shown.win)) tree.set('win', shown.win)
        for (const [id, values] of shown.rows) _patchRow(tree, id, values)
        for (const [id, deco] of shown.deco) if (!_isSame(tree.get(`deco/${id}`), deco)) tree.set(`deco/${id}`, deco)
}
