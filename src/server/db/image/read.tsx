import { DECO, MARK, STYLE, SYSTEM } from './utils/share/const'
import { quote } from './ddl'
import type { MarkRow, Queried, Req, Schema, StyleRow, Value } from '../utils/share/types'
import type { Columns } from './ddl'
import type { Sql } from './sql'

const _orderOf = (req: Req) => {
        if (!req.order) return '"_id"'
        const col = quote(req.order.col)
        return `${col} IS NULL, ${col} ${req.order.dir === 'desc' ? 'DESC' : 'ASC'}, "_id"`
}

const _filterOf = (req: Req) => (req.filter ? [{ text: `${quote(req.filter.col)} IS ?`, params: [req.filter.value] }] : [])

const _searchOf = (req: Req, names: string[]) => {
        if (!req.search) return []
        const text = `(${names.map((name) => `${quote(name)} LIKE ?`).join(' OR ') || 'FALSE'})`
        return [{ text, params: names.map(() => `%${req.search}%`) as Value[] }]
}

const _whereOf = (req: Req, names: string[]) => {
        const parts = [..._filterOf(req), ..._searchOf(req, names)]
        const where = parts.length ? `WHERE ${parts.map((part) => part.text).join(' AND ')}` : ''
        return { where, params: parts.flatMap((part) => part.params) }
}

export const createRead = ({ query }: Sql, cols: Columns) => {
        const _scan = (req: Req, select: string, from: number) => {
                const { where, params } = _whereOf(req, cols.names(req.page))
                const text = `SELECT ${select} FROM ${quote(req.page)} ${where} ORDER BY ${_orderOf(req)} LIMIT ? OFFSET ?`
                return query(text, [...params, req.to - from + 1, from - 1]).rows
        }
        const _count = (text: string, params: unknown[]) => Number(query(text, params).rows[0].n)
        const _orphansOf = (table: string, page: string) => {
                if (!cols.pages().includes(page)) return _count(`SELECT count(*) AS n FROM ${table} WHERE page = ?`, [page])
                const text = `SELECT count(*) AS n FROM ${table} WHERE page = ? AND (row NOT IN (SELECT "_id" FROM ${quote(page)}) OR col NOT IN (SELECT value FROM json_each(?)))`
                return _count(text, [page, JSON.stringify(cols.names(page))])
        }
        return {
                window: (req: Req): Queried => {
                        const names = cols.names(req.page)
                        const select = [...SYSTEM, ...names].map(quote).join(', ')
                        const from = Math.max(1, req.from)
                        const isScan = Boolean(req.order || req.filter || req.search)
                        const found = isScan ? _scan(req, select, from) : query(`SELECT ${select} FROM ${quote(req.page)} WHERE "_id" BETWEEN ? AND ?`, [from, req.to]).rows
                        const ids = JSON.stringify(found.map((row) => row._id))
                        const deco = (table: string, fields: string) => query(`SELECT ${fields} FROM ${table} WHERE page = ? AND row IN (SELECT value FROM json_each(?))`, [req.page, ids]).rows
                        const styles = deco(STYLE, 'row, col, json') as unknown as StyleRow[]
                        const marks = deco(MARK, 'row, col, "from", "to", attr, val') as unknown as MarkRow[]
                        const keys = [...SYSTEM.filter((key) => key === '_id' || found.some((row) => row[key] !== null)), ...names]
                        return { cols: keys, rows: found.map((row) => keys.map((key) => row[key])), styles, marks }
                },
                orphans: () => DECO.reduce((sum, table) => sum + query(`SELECT DISTINCT page FROM ${table}`).rows.reduce((n, r) => n + _orphansOf(table, String(r.page)), 0), 0),
                schema: (): Schema[] => cols.pages().map((page) => ({ page, columns: cols.columns(page), rows: _count(`SELECT count(*) AS n FROM ${quote(page)}`, []) })),
        }
}
