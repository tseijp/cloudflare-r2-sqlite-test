import { SQ } from '../const/const.ts'

export const MOVES: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
        Tab: [0, 1],
}

export const AFTER: Record<string, [number, number]> = { Enter: [1, 0], Tab: [0, 1] }

export const NEW_COL = { type: 'text', width: 4 } as const

const STYLE = {
        line: '#e5e7eb',
        head: '#f3f4f6',
        dim: '#9ca3af',
        sel: 'rgba(59, 130, 246, 0.15)',
        edge: '#3b82f6',
        text: '#111827',
        paper: '#ffffff',
} as const

const grid = (side: string) => `linear-gradient(to ${side}, ${STYLE.line} 1px, transparent 1px)`

export const CSS = {
        root: { display: 'flex', flexDirection: 'column', height: '100%', userSelect: 'none' },
        bar: { display: 'flex', gap: 8, padding: 6, borderBottom: `1px solid ${STYLE.line}`, fontSize: 13 },
        sheet: { flex: 1, overflow: 'auto', outline: 'none' },
        sticky: { position: 'sticky', top: 0, zIndex: 2, background: STYLE.paper },
        paper: { position: 'relative', backgroundImage: `${grid('right')}, ${grid('bottom')}`, backgroundSize: `${SQ}px ${SQ}px` },
        band: { position: 'relative', height: SQ },
        cell: {
                position: 'absolute',
                boxSizing: 'border-box',
                padding: '0 6px',
                lineHeight: `${SQ}px`,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                borderRight: `1px solid ${STYLE.line}`,
                borderBottom: `1px solid ${STYLE.line}`,
                fontSize: 13,
                color: STYLE.text,
        },
        letter: { padding: 0, textAlign: 'center', color: STYLE.dim },
        head: { background: STYLE.head, fontWeight: 600 },
        sort: { position: 'absolute', right: 8, cursor: 'pointer', color: STYLE.dim },
        handle: { position: 'absolute', right: 0, top: 0, width: 4, height: SQ, cursor: 'col-resize' },
        frame: { position: 'absolute', background: STYLE.sel, border: `2px solid ${STYLE.edge}`, pointerEvents: 'none', boxSizing: 'border-box' },
        input: { position: 'absolute', boxSizing: 'border-box', border: `2px solid ${STYLE.edge}`, outline: 'none', padding: '0 4px', fontSize: 13, zIndex: 3 },
} as const
