import * as Y from 'yjs'
import type { Op } from '@db/server-share'

interface Kept {
        text: string
        params: any[]
        tags: string[]
}

export const createTree = (doc: Y.Doc) => {
        const _view = doc.getMap<any[]>('view')
        const _edit = doc.getMap<string>('edit')
        const _kept = new Map<string, Kept>()
        const _undos = new Map<string, Y.UndoManager>()
        const _echo: Op[] = []
        const _wipe = (name: string, from: number) => {
                for (let slot = from; _view.has(`${name}/${slot}`); slot++) _view.delete(`${name}/${slot}`)
        }
        const _undo = (origin: string) => {
                if (!_undos.has(origin)) _undos.set(origin, new Y.UndoManager(_edit, { trackedOrigins: new Set([origin]), captureTimeout: 0 }))
                return _undos.get(origin)!
        }
        _edit.observe((event) => {
                if (!(event.transaction.origin instanceof Y.UndoManager)) return
                event.keysChanged.forEach((key) => _edit.has(key) && _echo.push({ type: 'echo', key, value: _edit.get(key) }))
        })
        return {
                view(name: string, rows: any[][]) {
                        doc.transact(() => {
                                rows.forEach((row, slot) => {
                                        if (JSON.stringify(_view.get(`${name}/${slot}`)) !== JSON.stringify(row)) _view.set(`${name}/${slot}`, row)
                                })
                                _wipe(name, rows.length)
                        })
                },
                keep: (name: string, text: string, params: any[], tags: string[]) => void _kept.set(name, { text, params, tags }),
                kept: () => [..._kept].map(([name, { text, params }]): [string, string, any[]] => [name, text, params]),
                drop(tag: string) {
                        doc.transact(() => {
                                for (const [name, { tags }] of _kept) if (tags.includes(tag)) (_kept.delete(name), _wipe(name, 0))
                        })
                },
                fill(key: string, value: string) {
                        if (!_edit.has(key)) _edit.set(key, value)
                },
                set(key: string, value: string, origin: string) {
                        _undo(origin)
                        doc.transact(() => _edit.set(key, value), origin)
                },
                undo: (origin: string) => void _undo(origin).undo(),
                redo: (origin: string) => void _undo(origin).redo(),
                forget() {
                        _undos.forEach((undo) => undo.clear())
                        doc.transact(() => _edit.forEach((_, key) => _edit.delete(key)))
                },
                echo: () => _echo.splice(0),
        }
}
