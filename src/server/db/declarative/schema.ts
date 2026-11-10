import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const col = sqliteTable(
        '_col',
        {
                page: text('page').notNull(),
                name: text('name').notNull(),
                type: text('type'),
                width: integer('width'),
                pos: real('pos'),
                hidden: integer('hidden'),
                options: text('options'),
        },
        (t) => [primaryKey({ columns: [t.page, t.name] })],
)

export const style = sqliteTable(
        '_style',
        {
                page: text('page').notNull(),
                row: integer('row').notNull(),
                col: text('col').notNull(),
                json: text('json').notNull(),
        },
        (t) => [primaryKey({ columns: [t.page, t.row, t.col] })],
)

export const mark = sqliteTable(
        '_mark',
        {
                page: text('page').notNull(),
                row: integer('row').notNull(),
                col: text('col').notNull(),
                from: integer('from').notNull(),
                attr: text('attr').notNull(),
                to: integer('to').notNull(),
                val: text('val').notNull(),
        },
        (t) => [primaryKey({ columns: [t.page, t.row, t.col, t.from, t.attr] })],
)
