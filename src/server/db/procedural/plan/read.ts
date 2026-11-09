import { and, asc, between, count, desc, like, max, or, sql } from 'drizzle-orm'
import { rowsAt, tableOf } from './ddl'
import type { Col, Ctx, Deco, Page, Req, Schema, Shown, Value } from '../share/types'

const _whereOf = (table: any, page: Page, req: Req) => {
        const filter = req.filter && table[req.filter.col] ? sql`${table[req.filter.col]} IS ${req.filter.value}` : undefined
        const search = req.search && page.cols.length ? or(...page.cols.map((c) => like(table[c.name], `%${req.search}%`))) : undefined
        return and(filter, search)
}

const _orderOf = (table: any, req: Req) => {
        const col = req.order && table[req.order.col]
        if (!col) return [table._id]
        return [sql`${col} IS NULL`, req.order!.dir === 'desc' ? desc(col) : asc(col), table._id]
}

const _decoOf = async ({ db, tables: { style, mark } }: Ctx, page: string, ids: number[]) => {
        const deco = new Map<number, Deco>()
        const at = (row: number) => deco.get(row) ?? deco.set(row, {}).get(row)!
        if (!ids.length) return deco
        for (const s of await db.select().from(style).where(rowsAt(style, page, ids))) at(s.row).s = { ...at(s.row).s, [s.col]: s.json }
        for (const m of await db.select().from(mark).where(rowsAt(mark, page, ids)).orderBy(mark.row, mark.col, mark.from)) {
                const marks = at(m.row).m ?? {}
                marks[m.col] = [...(marks[m.col] ?? []), { from: m.from, to: m.to, attr: m.attr, val: m.val }]
                at(m.row).m = marks
        }
        return deco
}

const _literal = (text: Value) => {
        const raw = text === null ? 'NULL' : String(text)
        if (raw === 'NULL') return null
        if (raw.startsWith("'")) return raw.slice(1, -1).replace(/''/g, "'")
        return Number(raw)
}

const _described = (col: Col, found?: Value[]) => ({ name: col.name, type: col.type, default: _literal(found?.[1] ?? null), optional: !found?.[2] })

export const readWindow = async (ctx: Ctx, req: Req): Promise<Shown> => {
        const page = ctx.pages.find((p) => p.name === req.page)
        if (!page) return Promise.reject(new Error(`page not found: ${req.page}`))
        const table = tableOf(page)
        const from = Math.max(1, req.from)
        const isView = !!(req.order || req.filter || req.search)
        const where = _whereOf(table, page, req)
        const query = ctx.db.select(Object.fromEntries([['id', table._id], ...page.cols.map((c, i) => [`c${i}`, table[c.name]])])).from(table)
        const rows: Value[][] = isView ? await query.where(where).orderBy(..._orderOf(table, req)).limit(req.to - from + 1).offset(from - 1).values() : await query.where(between(table._id, from, req.to)).orderBy(table._id).values()
        const [[total]] = isView ? await ctx.db.select({ n: count() }).from(table).where(where).values() : await ctx.db.select({ n: max(table._id) }).from(table).values()
        const ids = rows.map((row) => Number(row[0]))
        return { win: { ...req, from, rows: Number(total ?? 0), ids }, rows: new Map(rows.map((row) => [Number(row[0]), row.slice(1)])), deco: await _decoOf(ctx, req.page, ids) }
}

export const readSchema = async ({ db, pages }: Ctx) => {
        const out: Schema[] = []
        for (const page of pages) {
                const info: Value[][] = await db.values(sql`SELECT name, dflt_value, "notnull" FROM pragma_table_info(${page.name})`)
                const [[rows]] = await db.select({ n: count() }).from(tableOf(page)).values()
                out.push({ page: page.name, rows: Number(rows), columns: page.cols.map((c) => _described(c, info.find((r) => r[0] === c.name))) })
        }
        return out
}
