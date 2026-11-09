import type * as Y from 'yjs'
import type { Field, Line, Page, Ui, Win } from '../procedural/share/types'

export const createStore = (doc: Y.Doc) => {
        const _tree = doc.getMap<any>('grid')
        const _listeners = new Set<() => void>()
        let _version = 0
        let _ui: Ui = { sel: null, edit: null, drag: null }
        const _notify = () => {
                _version += 1
                for (const fn of _listeners) fn()
        }
        const win = (): Win | null => _tree.get('win') ?? null
        const lines = (): Line[] => {
                const current = win()
                const isView = !!(current?.order || current?.filter || current?.search)
                const lineOf = (id: number, i: number) => ({ id, pos: isView ? current!.from + i : id, values: _tree.get(`row/${id}`)?.toArray(), deco: _tree.get(`deco/${id}`) })
                return (current?.ids ?? []).map(lineOf).filter((line) => line.values)
        }
        _tree.observeDeep(_notify)
        return {
                win,
                lines,
                ui: () => _ui,
                version: () => _version,
                set: (patch: Partial<Ui>) => {
                        _ui = { ..._ui, ...patch }
                        _notify()
                },
                subscribe: (fn: () => void) => {
                        _listeners.add(fn)
                        return () => void _listeners.delete(fn)
                },
                pages: (): Page[] => [..._tree.entries()].filter(([key]) => key.startsWith('page/')).map(([, page]) => page as Page).sort((a, b) => a.pos - b.pos),
                fields: (): Field[] => {
                        const page: Page | undefined = _tree.get(`page/${win()?.page}`)
                        const fields = (page?.cols ?? []).map((col, at) => ({ ...col, at })).filter((col) => !col.hidden)
                        return fields.map((field, i) => (_ui.drag?.col === i ? { ...field, width: _ui.drag.width } : field))
                },
                lineAt: (pos: number) => lines().find((line) => line.pos === pos),
        }
}

export type Store = ReturnType<typeof createStore>
