import type { ColType, Mark, Order, Run, Value } from '../share/types'

const _MARK: Record<string, (val: string) => Record<string, string | number>> = {
        bold: () => ({ fontWeight: 700 }),
        italic: () => ({ fontStyle: 'italic' }),
        strike: () => ({ textDecoration: 'line-through' }),
        color: (val) => ({ color: val }),
}

const _STYLE: Record<string, (val: any) => Record<string, string | number>> = {
        fill: (val) => ({ background: val }),
        color: (val) => ({ color: val }),
        bold: (val) => ({ fontWeight: val ? 700 : 400 }),
        align: (val) => ({ textAlign: val }),
        border: (val) => ({ outline: `1px solid ${val}`, outlineOffset: -1 }),
}

export const letterOf = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letterOf(Math.floor(i / 26) - 1) + letterOf(i % 26))

export const offsets = (widths: number[]) => widths.reduce((xs, w) => [...xs, xs[xs.length - 1] + w], [0])

export const span = (a: number, b: number) => [Math.min(a, b), Math.max(a, b)]

export const format = (value: Value, type: ColType) => {
        if (type === 'bool' && value !== null) return value ? '☑' : '☐'
        return value === null ? '' : String(value)
}

export const styleOf = (json?: string) => {
        const parsed = json ? JSON.parse(json) : {}
        return Object.assign({}, ...Object.entries(parsed).map(([key, val]) => _STYLE[key]?.(val) ?? {}))
}

export const runsOf = (text: string, marks: Mark[] = []): Run[] => {
        const cuts = [...new Set([0, text.length, ...marks.flatMap((m) => [m.from, m.to])])].filter((n) => n <= text.length).sort((a, b) => a - b)
        return cuts.slice(0, -1).map((from, i) => ({
                text: text.slice(from, cuts[i + 1]),
                style: Object.assign({}, ...marks.filter((m) => m.from <= from && from < m.to).map((m) => _MARK[m.attr]?.(m.val) ?? {})),
        }))
}

export const nextOrder = (order: Order | undefined, col: string): Order | undefined => {
        if (order?.col !== col) return { col, dir: 'asc' }
        if (order.dir === 'asc') return { col, dir: 'desc' }
        return undefined
}

export const parseCsv = (text: string) => {
        const rows: string[][] = []
        let row: string[] = []
        let cell = ''
        let isQuoted = false
        for (let i = 0; i < text.length; i++) {
                const ch = text[i]
                const isEscape = isQuoted && ch === '"' && text[i + 1] === '"'
                if (isEscape) i++
                if (isEscape || (isQuoted && ch !== '"') || (!isQuoted && ch !== '"' && ch !== ',' && ch !== '\n' && ch !== '\r')) cell += ch
                if (ch === '"' && !isEscape) isQuoted = !isQuoted
                if (isQuoted || (ch !== ',' && ch !== '\n')) continue
                row.push(cell)
                cell = ''
                if (ch === '\n') rows.push(row)
                if (ch === '\n') row = []
        }
        if (cell || row.length) rows.push([...row, cell])
        return rows
}
