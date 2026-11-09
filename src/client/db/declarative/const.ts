export const SQ = 24

export const SQUARES = 35

export const WINDOW = 50

export const AHEAD = 10

export const BAND = 2

export const FILL = '#fef08a'

const _LINE = '#e5e7eb'

const _cell = { position: 'absolute', height: 24, boxSizing: 'border-box', padding: '0 4px', lineHeight: '24px', fontSize: 12, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } as const

export const CSS = {
        root: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' },
        bar: { display: 'flex', gap: 4, padding: 4, alignItems: 'center', borderBottom: `1px solid ${_LINE}` },
        tab: { padding: '2px 8px', border: `1px solid ${_LINE}`, borderRadius: 4, background: '#fff', cursor: 'pointer' },
        sheet: { flex: 1, overflow: 'auto', position: 'relative', outline: 'none', userSelect: 'none' },
        sticky: { position: 'sticky', top: 0, zIndex: 2, background: '#f9fafb', height: SQ * BAND },
        paper: { position: 'relative', backgroundImage: `linear-gradient(${_LINE} 1px, transparent 1px), linear-gradient(90deg, ${_LINE} 1px, transparent 1px)`, backgroundSize: `${SQ}px ${SQ}px` },
        cell: _cell,
        letter: { ..._cell, color: '#9ca3af', textAlign: 'center', padding: 0 },
        head: { ..._cell, fontWeight: 600, borderRight: `1px solid ${_LINE}`, background: '#f3f4f6' },
        data: { ..._cell, background: '#fff', borderRight: `1px solid ${_LINE}`, borderBottom: `1px solid ${_LINE}` },
        sort: { marginLeft: 4, color: '#9ca3af', cursor: 'pointer' },
        handle: { position: 'absolute', right: 0, top: 0, width: 6, height: '100%', cursor: 'col-resize' },
        frame: { position: 'absolute', border: '2px solid #2563eb', boxSizing: 'border-box', pointerEvents: 'none', background: 'rgba(37, 99, 235, 0.06)' },
        input: { ..._cell, zIndex: 3, border: '2px solid #2563eb', outline: 'none', background: '#fff' },
} as const
