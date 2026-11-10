import { evictViews, patchPages, patchView, pruneRows, viewsOf } from '../procedural/view/index'
import type * as Y from 'yjs'
import type { Table } from './table'
import type { Op, Req, Sheet, Shown, Value } from '../procedural/share/types'

const _MAIN = 'main'

const _ORIGINS = ['win', 'act']

export const createWindow = async (doc: Y.Doc, table: Table, config: { size: number; max: number; limit: number; views: number }) => {
        const _tree = doc.getMap<any>('grid')
        const _undo: Op[][] = []
        const _redo: Op[][] = []
        let _seq = 0
        let _healing: Promise<void> | null = null
        const _reqOf = (view: string): Req | null => {
                const win = _tree.get(`win/${view}`)
                const pages = table.pages()
                const isOpen = !!win && pages.some((page) => page.name === win.page)
                if (isOpen) return { page: win.page, from: win.from, to: win.to, order: win.order, filter: win.filter, search: win.search }
                return pages[0] ? { page: pages[0].name, from: 1, to: config.size } : null
        }
        const _show = async (reqs: [string, Req | null][], origin: string) => {
                const shown: [string, Shown | null][] = []
                for (const [view, req] of reqs) shown.push([view, req && (await table.window(req))])
                doc.transact(() => {
                        patchPages(_tree, table.pages())
                        if (_tree.get('rev') !== table.version()) _tree.set('rev', table.version())
                        for (const [view, one] of shown) patchView(_tree, view, one, { seq: _tree.get(`win/${view}`)?.seq ?? ++_seq })
                        evictViews(_tree, config.views)
                        pruneRows(_tree)
                }, origin)
        }
        const _refresh = () => {
                const views = viewsOf(_tree)
                return _show((views.length ? views : [_MAIN]).map((view) => [view, _reqOf(view)]), 'act')
        }
        const _flip = async (from: Op[][], to: Op[][]) => {
                const ops = from.pop()
                if (!ops) return
                const done = await table.apply(ops)
                to.push(done.undo)
                await _refresh()
        }
        const _heal = (event: Y.YMapEvent<any>) => {
                const isForeign = !_ORIGINS.includes(event.transaction.origin)
                if (isForeign) _healing ??= Promise.resolve().then(() => {
                        _healing = null
                        return _refresh()
                })
        }
        await _show([[_MAIN, _reqOf(_MAIN)]], 'win')
        _tree.observe(_heal)
        return {
                async move(req: Req) {
                        const view = req.view ?? _MAIN
                        const to = Math.min(req.to, Math.max(1, req.from) + config.max - 1)
                        const shown = await table.window({ ...req, to })
                        doc.transact(() => {
                                _tree.delete(`win/${view}`)
                                patchView(_tree, view, shown, { seq: ++_seq })
                                evictViews(_tree, config.views)
                                pruneRows(_tree)
                        }, 'win')
                },
                async act(op: Op) {
                        const done = await table.apply([op])
                        if (done.undo.length) _undo.push(done.undo)
                        if (done.undo.length) _redo.length = 0
                        await _refresh()
                        return { id: done.id ?? null }
                },
                undo() {
                        return _flip(_undo, _redo)
                },
                redo() {
                        return _flip(_redo, _undo)
                },
                async load(sheets: Sheet[]) {
                        const names = await table.load(sheets)
                        await _refresh()
                        return names
                },
                async sql(text: string, params?: Value[]) {
                        const result = await table.sql(text, params, config.limit)
                        await _refresh()
                        return result
                },
                dump() {
                        return _tree.toJSON()
                },
                refresh() {
                        return _refresh()
                },
                forget() {
                        _undo.length = 0
                        _redo.length = 0
                },
        }
}
