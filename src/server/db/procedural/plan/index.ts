import { and, eq, inArray, sql } from 'drizzle-orm'
import { clamp } from '../share/value'
import { addColumn, createPage, isPlain, loadRows, renameColumn, rowsAt, tableOf, tombOf, WIDTH } from './ddl'
import type { Cell, ColDecl, ColSet, Ctx, Done, Mark, Op, Paint } from '../share/types'

export { dropTombs, ensureTable, readLayout } from './ddl'
export { readSchema, readWindow } from './read'

const _ATTRS = ['type', 'width', 'hidden', 'options', 'pos'] as const

const _pageOf = (ctx: Ctx, name: string) => ctx.pages.find((p) => p.name === name)!

const _each = async <T>(items: T[], fn: (item: T) => Promise<T | null>) => {
        const undo: T[] = []
        for (const item of items) {
                const back = await fn(item)
                if (back) undo.unshift(back)
        }
        return undo
}

const _cellAt = (table: any, page: string, cell: { row: number; col: string }) => and(eq(table.page, page), eq(table.row, cell.row), eq(table.col, cell.col))

const _colAt = (table: any, page: string, col: string) => and(eq(table.page, page), eq(table.col, col))

const _decoOps = (page: string, styles: Paint[], marks: (Mark & { row: number; col: string })[]): Op[] => {
        const cells = new Map<string, Cell>()
        for (const m of marks) {
                const cell = cells.get(`${m.row}:${m.col}`) ?? { row: m.row, col: m.col, marks: [] }
                cell.marks!.push({ from: m.from, to: m.to, attr: m.attr, val: m.val })
                cells.set(`${m.row}:${m.col}`, cell)
        }
        const painted: Op[] = styles.length ? [{ kind: 'style', page, cells: styles.map((s) => ({ row: s.row, col: s.col, json: s.json })) }] : []
        return cells.size ? [...painted, { kind: 'cells', page, cells: [...cells.values()] }] : painted
}

const _remark = async ({ db, tables: { mark } }: Ctx, page: string, cell: Cell, marks: Mark[]) => {
        await db.delete(mark).where(_cellAt(mark, page, cell))
        if (marks.length) await db.insert(mark).values(marks.map((m) => ({ page, row: cell.row, col: cell.col, ...m })))
}

const _cell = async (ctx: Ctx, page: string, table: any, cell: Cell): Promise<Cell | null> => {
        const { db, tables: { mark } } = ctx
        const [old] = await db.select({ v: table[cell.col] }).from(table).where(eq(table._id, cell.row)).values()
        if (!old) return null
        const value = cell.value === undefined ? old[0] : cell.value
        const before: Mark[] = await db.select({ from: mark.from, to: mark.to, attr: mark.attr, val: mark.val }).from(mark).where(_cellAt(mark, page, cell)).orderBy(mark.from, mark.attr)
        const after = clamp(cell.marks ?? before, value)
        const { changes } = await db.update(table).set({ [cell.col]: value }).where(and(eq(table._id, cell.row), sql`${table[cell.col]} IS NOT ${value}`))
        const isMarked = JSON.stringify(after) !== JSON.stringify(before)
        if (isMarked) await _remark(ctx, page, cell, after)
        return changes || isMarked ? { row: cell.row, col: cell.col, value: old[0], marks: before } : null
}

const _paint = async ({ db, tables: { style } }: Ctx, page: string, table: any, paint: Paint): Promise<Paint | null> => {
        const where = _cellAt(style, page, paint)
        const rows = await db.select({ id: table._id }).from(table).where(eq(table._id, paint.row)).values()
        if (!rows.length) return null
        const [found] = await db.select({ json: style.json }).from(style).where(where).values()
        const old = found ? found[0] : null
        if (old === paint.json) return null
        if (paint.json === null) await db.delete(style).where(where)
        if (paint.json !== null) await db.insert(style).values({ page, ...paint }).onConflictDoUpdate({ target: [style.page, style.row, style.col], set: { json: paint.json } })
        return { row: paint.row, col: paint.col, json: old }
}

const _saveCol = ({ db, tables: { col } }: Ctx, page: string, c: ColDecl) => {
        const values = { type: c.type, width: c.width ?? WIDTH, pos: c.pos ?? null, hidden: c.hidden ? 1 : 0, options: JSON.stringify(c.options ?? []) }
        return db.insert(col).values({ page, name: c.name, ...values }).onConflictDoUpdate({ target: [col.page, col.name], set: values })
}

const _rename = async ({ db, tables: { col, style, mark } }: Ctx, page: string, from: string, to: string) => {
        await renameColumn(db, page, from, to)
        await db.update(col).set({ name: to }).where(and(eq(col.page, page), eq(col.name, from)))
        await db.update(style).set({ col: to }).where(_colAt(style, page, from))
        await db.update(mark).set({ col: to }).where(_colAt(mark, page, from))
}

const _pageAdd = async (ctx: Ctx, op: { name: string; cols?: ColDecl[] }): Promise<Done> => {
        await createPage(ctx.db, op.name, op.cols ?? [])
        for (const c of op.cols ?? []) if (!isPlain(c)) await _saveCol(ctx, op.name, c)
        return { id: op.name, isLayout: true, undo: [] }
}

const _APPLY: Record<Op['kind'], (ctx: Ctx, op: any) => Promise<Done>> = {
        cells: async (ctx, op: Op & { kind: 'cells' }) => {
                const table = tableOf(_pageOf(ctx, op.page))
                const undo = await _each(op.cells, (cell) => _cell(ctx, op.page, table, cell))
                return { undo: undo.length ? [{ kind: 'cells', page: op.page, cells: undo }] : [] }
        },
        style: async (ctx, op: Op & { kind: 'style' }) => {
                const table = tableOf(_pageOf(ctx, op.page))
                const undo = await _each(op.cells, (paint) => _paint(ctx, op.page, table, paint))
                return { undo: undo.length ? [{ kind: 'style', page: op.page, cells: undo }] : [] }
        },
        'row.add': async (ctx, op: Op & { kind: 'row.add' }) => {
                const table = tableOf(_pageOf(ctx, op.page))
                const [{ id }] = await ctx.db.insert(table).values({ ...op.values, ...(op.id ? { _id: op.id } : {}) }).returning({ id: table._id })
                return { id, undo: [{ kind: 'row.remove', page: op.page, rows: [id] }] }
        },
        'row.remove': async (ctx, op: Op & { kind: 'row.remove' }) => {
                const { db, tables: { style, mark } } = ctx
                const table = tableOf(_pageOf(ctx, op.page))
                const rows = await db.select().from(table).where(inArray(table._id, op.rows))
                const styles = await db.select().from(style).where(rowsAt(style, op.page, op.rows))
                const marks = await db.select().from(mark).where(rowsAt(mark, op.page, op.rows))
                await db.delete(table).where(inArray(table._id, op.rows))
                await db.delete(style).where(rowsAt(style, op.page, op.rows))
                await db.delete(mark).where(rowsAt(mark, op.page, op.rows))
                const adds: Op[] = rows.map(({ _id, ...values }: any) => ({ kind: 'row.add', page: op.page, id: _id, values }))
                return { undo: [...adds, ..._decoOps(op.page, styles, marks)] }
        },
        'col.add': async (ctx, op: Op & { kind: 'col.add' }) => {
                await addColumn(ctx.db, op.page, op)
                if (!isPlain(op)) await _saveCol(ctx, op.page, op)
                return { isLayout: true, undo: [{ kind: 'col.remove', page: op.page, name: op.name }] }
        },
        'col.set': async (ctx, op: Op & { kind: 'col.set' } & ColSet) => {
                const [found] = await ctx.db.values(sql`SELECT type FROM pragma_table_info(${op.page}) WHERE name = ${op.name}`)
                if (!found) return Promise.reject(new Error(`column not found: ${op.name}`))
                const old = _pageOf(ctx, op.page).cols.find((c) => c.name === op.name) ?? { name: op.name, type: 'text' as const, width: WIDTH, hidden: false, options: [] }
                const name = op.to ?? op.name
                const changed = _ATTRS.filter((key) => op[key] !== undefined)
                if (name !== op.name) await _rename(ctx, op.page, op.name, name)
                if (changed.length) await _saveCol(ctx, op.page, { ...old, ...Object.fromEntries(changed.map((key) => [key, op[key]])), name })
                const back = Object.fromEntries(changed.map((key) => [key, (old as any)[key]]))
                return { isLayout: true, undo: [{ kind: 'col.set', page: op.page, name, to: op.name, ...back }] }
        },
        'col.remove': async (ctx, op: Op & { kind: 'col.remove' }) => {
                const { db, tables: { col, style, mark } } = ctx
                const old = _pageOf(ctx, op.page).cols.find((c) => c.name === op.name)
                if (!old) return { undo: [] }
                const tomb = tombOf(op.name)
                const styles = await db.select().from(style).where(_colAt(style, op.page, op.name))
                const marks = await db.select().from(mark).where(_colAt(mark, op.page, op.name))
                await renameColumn(db, op.page, op.name, tomb)
                await db.delete(col).where(and(eq(col.page, op.page), eq(col.name, op.name)))
                await db.delete(style).where(_colAt(style, op.page, op.name))
                await db.delete(mark).where(_colAt(mark, op.page, op.name))
                const revive: Op = { kind: 'col.set', page: op.page, name: tomb, to: op.name, type: old.type, width: old.width, pos: old.pos, hidden: old.hidden, options: old.options }
                return { isLayout: true, undo: [revive, ..._decoOps(op.page, styles, marks)] }
        },
        'page.add': _pageAdd,
}

export const applyOp = (ctx: Ctx, op: Op) => _APPLY[op.kind](ctx, op)

export const loadSheet = async (ctx: Ctx, sheet: { name: string; cols: ColDecl[]; rows: string[][] }, chunk: number) => {
        await _pageAdd(ctx, sheet)
        await loadRows(ctx.db, sheet.name, sheet.cols, sheet.rows, chunk)
        return sheet.name
}
