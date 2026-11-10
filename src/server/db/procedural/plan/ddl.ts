import { and, eq, inArray, sql } from 'drizzle-orm'
import { getTableConfig, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { Col, ColDecl, ColType, Page, Value } from '../share/types'

const _SQL: Record<ColType, string> = { text: 'TEXT', number: 'REAL', int: 'INTEGER', bool: 'INTEGER', date: 'TEXT', datetime: 'TEXT', json: 'TEXT' }

const _KIND: Record<string, ColType> = { INTEGER: 'int', REAL: 'number' }

const _LOGICAL: ColType[] = ['bool', 'date', 'datetime', 'json']

const _TOMB = '_drop:'

export const WIDTH = 3

const _PAGES = sql`SELECT name FROM sqlite_master WHERE type = 'table' AND substr(name, 1, 1) <> '_' AND substr(name, 1, 7) <> 'sqlite_' ORDER BY rowid`

const _COLS = sql`SELECT m.name, p.name, p.type, c.type, c.width, c.pos, c.hidden, c.options, p.cid FROM sqlite_master m JOIN pragma_table_info(m.name) p LEFT JOIN _col c ON c.page = m.name AND c.name = p.name WHERE m.type = 'table' AND p.name <> '_id' AND substr(p.name, 1, 6) <> ${_TOMB} ORDER BY coalesce(c.pos, p.cid)`

const _TOMBS = sql`SELECT m.name, p.name FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type = 'table' AND substr(p.name, 1, 6) = ${_TOMB}`

const _column = (c: ColDecl) => {
        const isStrict = c.default != null && c.optional === false
        const fallback = c.default == null ? sql.raw('') : sql` DEFAULT ${c.default}`
        return sql`${sql.identifier(c.name)} ${sql.raw(_SQL[c.type])}${sql.raw(isStrict ? ' NOT NULL' : '')}${fallback}`
}

const _colOf = (r: Value[]): Col => ({
        name: String(r[1]),
        type: (r[3] ?? _KIND[String(r[2]).toUpperCase()] ?? 'text') as ColType,
        width: Number(r[4] ?? WIDTH),
        pos: Number(r[5] ?? r[8]),
        hidden: !!r[6],
        options: r[7] ? JSON.parse(String(r[7])) : [],
})

const _builderOf = (c: Col) => {
        if (c.type === 'number') return real(c.name)
        if (c.type === 'int' || c.type === 'bool') return integer(c.name)
        return text(c.name)
}

export const tableOf = (page: Page): any => sqliteTable(page.name, { _id: integer('_id').primaryKey(), ...Object.fromEntries(page.cols.map((c) => [c.name, _builderOf(c)])) })

export const rowsAt = (table: any, page: string, rows: number[]) => and(eq(table.page, page), inArray(table.row, rows))

export const isPlain = (c: ColDecl) => !c.hidden && !c.options?.length && c.pos === undefined && (c.width ?? WIDTH) === WIDTH && !_LOGICAL.includes(c.type)

export const tombOf = (name: string) => `${_TOMB}${Date.now().toString(36)}:${name}`

export const ensureTable = (db: any, table: any) => {
        const config = getTableConfig(table)
        const cols = config.columns.map((c) => sql`${sql.identifier(c.name)} ${sql.raw(c.getSQLType())}`)
        const keys = sql.join(config.primaryKeys[0].columns.map((c) => sql.identifier(c.name)), sql.raw(', '))
        return db.run(sql`CREATE TABLE IF NOT EXISTS ${sql.identifier(config.name)} (${sql.join(cols, sql.raw(', '))}, PRIMARY KEY (${keys})) WITHOUT ROWID`)
}

export const createPage = (db: any, name: string, cols: ColDecl[]) => {
        const defs = sql.join([sql.raw('_id INTEGER PRIMARY KEY'), ...cols.map(_column)], sql.raw(', '))
        return db.run(sql`CREATE TABLE ${sql.identifier(name)} (${defs})`.inlineParams())
}

export const addColumn = (db: any, page: string, col: ColDecl) => db.run(sql`ALTER TABLE ${sql.identifier(page)} ADD COLUMN ${_column(col)}`.inlineParams())

export const renameColumn = (db: any, page: string, from: string, to: string) => db.run(sql`ALTER TABLE ${sql.identifier(page)} RENAME COLUMN ${sql.identifier(from)} TO ${sql.identifier(to)}`)

export const dropTombs = async (db: any) => {
        const tombs: Value[][] = await db.values(_TOMBS)
        for (const [page, name] of tombs) await db.run(sql`ALTER TABLE ${sql.identifier(String(page))} DROP COLUMN ${sql.identifier(String(name))}`)
        return tombs.length
}

export const readLayout = async (db: any): Promise<Page[]> => {
        const pages: Value[][] = await db.values(_PAGES)
        const cols: Value[][] = await db.values(_COLS)
        return pages.map(([name], pos) => ({ name: String(name), pos, cols: cols.filter((r) => r[0] === name).map(_colOf) }))
}

export const loadRows = async (db: any, page: string, cols: ColDecl[], rows: string[][], chunk: number) => {
        const names = sql.join(cols.map((c) => sql.identifier(c.name)), sql.raw(', '))
        const picks = sql.join(cols.map((_, i) => sql`NULLIF(value ->> ${i}, '')`), sql.raw(', '))
        for (let i = 0; i < rows.length && cols.length; i += chunk) await db.run(sql`INSERT INTO ${sql.identifier(page)} (${names}) SELECT ${picks} FROM json_each(${JSON.stringify(rows.slice(i, i + chunk))})`)
}
