import { patchPages, patchShown } from '../procedural/view/index'
import type * as Y from 'yjs'
import type { Table } from './table'
import type { Op, Req, Sheet, Value } from '../procedural/share/types'

export const createWindow = async (doc: Y.Doc, table: Table, config: { size: number; max: number; limit: number }) => {
        const _tree = doc.getMap<any>('grid')
        const _undo: Op[][] = []
        const _redo: Op[][] = []
        const _show = async (req: Req | null, origin: string) => {
                const shown = req && (await table.window(req))
                doc.transact(() => {
                        patchPages(_tree, table.pages())
                        patchShown(_tree, shown)
                }, origin)
        }
        const _current = (): Req | null => {
                const win = _tree.get('win')
                const pages = table.pages()
                const isOpen = !!win && pages.some((page) => page.name === win.page)
                if (isOpen) return { page: win.page, from: win.from, to: win.to, order: win.order, filter: win.filter, search: win.search }
                return pages[0] ? { page: pages[0].name, from: 1, to: config.size } : null
        }
        const _refresh = () => _show(_current(), 'act')
        const _flip = async (from: Op[][], to: Op[][]) => {
                const ops = from.pop()
                if (!ops) return
                const done = await table.apply(ops)
                to.push(done.undo)
                await _refresh()
        }
        await _show(_current(), 'win')
        return {
                move(req: Req) {
                        return _show({ ...req, to: Math.min(req.to, Math.max(1, req.from) + config.max - 1) }, 'win')
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
        }
}
