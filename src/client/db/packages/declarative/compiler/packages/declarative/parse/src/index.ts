import { toRows } from '@db/client-compiler-parse-csv'
import type { Event, Snap } from '@db/client-share'

const _ARROWS: Record<string, [dx: number, dy: number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }

const _key = ({ key, shift, meta, composing }: Event, snap: Snap): Event | null => {
        const lower = key.toLowerCase()
        const isChar = key.length === 1 && !meta
        if (composing) return null
        if (snap.edit && key === 'Enter') return { type: 'commit', dx: 0, dy: 1 }
        if (snap.edit && key === 'Tab') return { type: 'commit', dx: shift ? -1 : 1, dy: 0 }
        if (snap.edit && key === 'Escape') return { type: 'cancel' }
        if (snap.edit) return null
        if (meta && lower === 'z') return { type: shift ? 'redo' : 'undo' }
        if (meta && lower === 'y') return { type: 'redo' }
        if (_ARROWS[key]) return { type: 'move', dx: _ARROWS[key][0], dy: _ARROWS[key][1] }
        if (key === 'Tab') return { type: 'move', dx: shift ? -1 : 1, dy: 0 }
        if (key === 'Enter' || key === 'F2') return { type: 'edit' }
        if (key === 'Delete' || key === 'Backspace') return { type: 'clear' }
        if (isChar) return { type: 'edit', text: key }
        return null
}

const _wheel = ({ dy }: Event): Event => ({ type: 'scroll', dy: Math.sign(dy) * 3 })

const _file = ({ name, text }: Event): Event => {
        const [names = [], ...rows] = toRows(text)
        return { type: 'load', name: name.replace(/\.[^.]+$/, ''), names, rows }
}

const _PARSERS: Record<string, (event: Event, snap: Snap) => Event | null> = { key: _key, wheel: _wheel, file: _file }

export const parse = (event: Event, snap: Snap): Event | null => {
        if (!Object.hasOwn(_PARSERS, event.type)) return event
        return _PARSERS[event.type](event, snap)
}
