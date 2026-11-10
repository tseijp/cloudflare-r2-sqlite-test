import { SQL, is, sql } from 'drizzle-orm'
import { SQLiteSyncDialect, getTableConfig, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { Code } from '@db/server-share'

const _dialect = new SQLiteSyncDialect()

// @ts-ignore
export const db = drizzle(() => Promise.resolve({ rows: [] }))

export const style = sqliteTable('_style', { page: text('page').notNull(), row: integer('row').notNull(), col: text('col').notNull(), name: text('name').notNull(), value: text('value').notNull() }, (t) => [primaryKey({ columns: [t.page, t.row, t.col, t.name] })])

export const mark = sqliteTable('_mark', { page: text('page').notNull(), row: integer('row').notNull(), col: text('col').notNull(), start: integer('start').notNull(), name: text('name').notNull(), stop: integer('stop').notNull(), value: text('value').notNull() }, (t) => [primaryKey({ columns: [t.page, t.row, t.col, t.start, t.name] })])

export const id = (name: string) => sql.identifier(name)

export const list = (parts: any[]) => sql.join(parts, sql`, `)

export const query = (built: any): [text: string, params: any[]] => {
        const { sql: found, params } = is(built, SQL) ? _dialect.sqlToQuery(built) : built.toSQL()
        return [found, params]
}

export const run = (built: any): Code => ['sql', ...query(built)]

export const create = (table: SQLiteTable) => {
        const { name, columns, primaryKeys } = getTableConfig(table)
        const cols = columns.map((column) => sql`${id(column.name)} ${sql.raw(column.getSQLType())} not null`)
        return sql`create table if not exists ${id(name)} (${list(cols)}, primary key (${list(primaryKeys[0].columns.map((column) => id(column.name)))})) without rowid`
}

export const BEGIN: Code = ['sql', 'begin', []]

export const COMMIT: Code = ['sql', 'commit', []]
