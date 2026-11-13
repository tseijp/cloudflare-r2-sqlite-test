import type * as Y from 'yjs'
import type { Snap, State } from '@db/client-share'

export const createState = (doc: Y.Doc, id: string) => {
        const _view = doc.getMap<any[]>('view')
        const _listeners = new Set<() => void>()
        let _state: State = { page: '', top: 1, sel: null, edit: null, result: null, note: '' }
        let _snap = {} as Snap
        const _list = (name: string) => {
                const rows: any[][] = []
                for (let slot = 0; _view.has(`${name}/${slot}`); slot++) rows.push(_view.get(`${name}/${slot}`)!)
                return rows
        }
        const _render = () => {
                const styles = Object.fromEntries(_list(`${id}/styles`).map(([row, col, name, value]) => [`${row}/${col}/${name}`, value]))
                const marks: Record<string, any[][]> = {}
                _list(`${id}/marks`).forEach(([row, col, ...mark]) => (marks[`${row}/${col}`] ??= []).push(mark))
                _snap = {
                        ..._state,
                        id,
                        styles,
                        marks,
                        pages: _list('pages').map(([name]) => name),
                        cols: _list(`${id}/cols`).map(([name, width]) => [name, Number(width)]),
                        rows: _list(`${id}/rows`),
                        last: _list(`${id}/last`)[0]?.[0] ?? 0,
                }
                _listeners.forEach((listener) => listener())
        }
        _view.observe(_render)
        _render()
        return {
                snap: () => _snap,
                patch(patch: Partial<State>) {
                        _state = { ..._state, ...patch }
                        _render()
                },
                subscribe(listener: () => void) {
                        _listeners.add(listener)
                        return () => void _listeners.delete(listener)
                },
        }
}
