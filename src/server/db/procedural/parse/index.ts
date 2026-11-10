import { clamp, isNumeric, normalize } from '../share/value'
import type { Cell, ColDecl, ColType, Op, Page, Sheet } from '../share/types'

const _INT = /^-?(0|[1-9]\d{0,14})$/

const _RESERVED = ['_id', '__proto__']

const _unique = (name: string, taken: Set<string>) => {
        const base = name.replace(/^_drop:/, '')
        let out = base
        for (let n = 2; taken.has(out); n++) out = `${base} (${n})`
        taken.add(out)
        return out
}

const _pageName = (name: string, pages: Page[]) => {
        const clean = name.trim().replace(/^(_+|sqlite_)/i, '')
        return _unique(clean || 'シート', new Set(pages.map((p) => p.name)))
}

const _colName = (name: string, page: Page) => _unique(name.trim() || `列${page.cols.length + 1}`, new Set([..._RESERVED, ...page.cols.map((c) => c.name)]))

const _units = (text: string) => [...text].reduce((n, ch) => n + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0)

const _typeOf = (cells: string[]): ColType => {
        const filled = cells.filter((cell) => cell !== '')
        if (filled.length && filled.every((cell) => _INT.test(cell))) return 'int'
        if (filled.length && filled.every(isNumeric)) return 'number'
        return 'text'
}

const _parseCols = (cols: ColDecl[]) => {
        const taken = new Set(_RESERVED)
        return cols.map((c, i) => ({ ...c, name: _unique(c.name.trim() || `列${i + 1}`, taken), default: normalize(c.type, c.default) }))
}

const _parseCell = (cell: Cell, type: ColType) => {
        const value = cell.value === undefined ? undefined : normalize(type, cell.value)
        const isClamped = !!cell.marks && value !== undefined
        return { ...cell, value, marks: isClamped ? clamp(cell.marks!, value!) : cell.marks }
}

export const parseOp = (op: Op, pages: Page[]): Op | null => {
        if (op.kind === 'page.add') return { ...op, name: _pageName(op.name, pages), cols: _parseCols(op.cols ?? []) }
        const page = pages.find((p) => p.name === op.page)
        const typeOf = (name: string) => page?.cols.find((c) => c.name === name)?.type
        if (!page) return null
        if (op.kind === 'cells') return { ...op, cells: op.cells.filter((c) => typeOf(c.col)).map((c) => _parseCell(c, typeOf(c.col)!)) }
        if (op.kind === 'style') return { ...op, cells: op.cells.filter((c) => typeOf(c.col)).map((c) => ({ ...c, json: c.json === null || typeof c.json === 'string' ? c.json : JSON.stringify(c.json) })) }
        if (op.kind === 'row.add') return { ...op, values: Object.fromEntries(page.cols.filter((c) => op.values && c.name in op.values).map((c) => [c.name, normalize(c.type, op.values![c.name])])) }
        if (op.kind === 'col.add') return { ...op, name: _colName(op.name, page), type: op.type ?? 'text', default: normalize(op.type ?? 'text', op.default) }
        if (op.kind === 'col.set' && op.to !== undefined && op.to !== op.name) return { ...op, to: _colName(op.to, page) }
        return op
}

export const parseSheet = (sheet: Sheet, pages: Page[], sample: number) => {
        const width = sheet.rows.reduce((n, row) => Math.max(n, row.length), 0)
        const head = sheet.rows[0] ?? []
        const body = sheet.rows.slice(1, sample + 1)
        const types = Array.from({ length: width }, (_, i) => _typeOf(body.map((row) => row[i] ?? '')))
        const isHeadless = types.some((type, i) => type !== 'text' && isNumeric(head[i] ?? ''))
        const taken = new Set(_RESERVED)
        const cols: ColDecl[] = types.map((type, i) => {
                const name = _unique((isHeadless ? '' : (head[i] ?? '').trim()) || `列${i + 1}`, taken)
                const longest = body.slice(0, 100).reduce((n, row) => Math.max(n, _units(row[i] ?? '')), _units(name))
                return { name, type, width: Math.min(8, Math.max(2, Math.ceil(longest / 3))) }
        })
        return { name: _pageName(sheet.name, pages), cols, rows: isHeadless ? sheet.rows : sheet.rows.slice(1) }
}
