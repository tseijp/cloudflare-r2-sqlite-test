import { and, eq, inArray, sql } from 'drizzle-orm'
import { ROWS, WIDTH } from '@db/server-share'
import { db, id, mark, query, style } from '@db/server-compiler-plan-share'
import type { Code, Op } from '@db/server-share'

export const view = {
        window: ({ id: who, page, top, size }: Op): Code[] => {
                const tags = ['window', `id:${who}`, `page:${page.toLowerCase()}`]
                const ids = sql`(select "_id" from ${id(page)} where "_id" >= ${top} order by "_id" limit ${size})`
                const cols = sql`select i."name", coalesce(s."value", ${WIDTH}) from pragma_table_info(${page}) i left join "_style" s on s."page" = ${page} and s."row" = 0 and s."col" = i."name" and s."name" = 'width' where i."cid" > 0 order by i."cid"`
                const rows = sql`select * from ${id(page)} where "_id" >= ${top} order by "_id" limit ${size}`
                const styles = db.select({ row: style.row, col: style.col, name: style.name, value: style.value }).from(style).where(and(eq(style.page, page), inArray(style.row, ids)))
                const marks = db.select({ row: mark.row, col: mark.col, start: mark.start, stop: mark.stop, name: mark.name, value: mark.value }).from(mark).where(and(eq(mark.page, page), inArray(mark.row, ids)))
                const last = sql`select max("_id") from ${id(page)}`
                return [
                        ['view', `${who}/rows`, ...query(rows), tags],
                        ['view', `${who}/cols`, ...query(cols), tags],
                        ['view', `${who}/styles`, ...query(styles), tags],
                        ['view', `${who}/marks`, ...query(marks), tags],
                        ['view', `${who}/last`, ...query(last), tags],
                ]
        },
        sql: ({ text }: Op): Code[] => [['read', text, ROWS]],
        leave: ({ id: who }: Op): Code[] => [['drop', `id:${who}`]],
        undo: ({ id: who }: Op): Code[] => [['undo', who]],
        redo: ({ id: who }: Op): Code[] => [['redo', who]],
}
