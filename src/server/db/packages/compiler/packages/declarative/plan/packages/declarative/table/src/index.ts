import { and, eq, sql } from 'drizzle-orm'
import { BEGIN, COMMIT, db, id, mark, run, style } from '@db/server-compiler-plan-share'
import type { Code, Op } from '@db/server-share'

const _on = (table: typeof style | typeof mark, { page, col }: Op) => and(eq(table.page, page), eq(table.col, col))

export const table = {
        'page.add': ({ page }: Op): Code[] => [run(sql`create table ${id(page)} ("_id" integer primary key autoincrement)`), ['refresh']],
        'page.del': ({ page }: Op): Code[] => [
                BEGIN,
                run(sql`drop table ${id(page)}`),
                run(db.delete(style).where(eq(style.page, page))),
                run(db.delete(mark).where(eq(mark.page, page))),
                COMMIT,
                ['drop', `page:${page}`],
                ['refresh'],
                ['forget'],
        ],
        'col.add': ({ page, col }: Op): Code[] => [run(sql`alter table ${id(page)} add column ${id(col)} text`), ['refresh']],
        'col.del': (op: Op): Code[] => [
                BEGIN,
                run(sql`alter table ${id(op.page)} drop column ${id(op.col)}`),
                run(db.delete(style).where(_on(style, op))),
                run(db.delete(mark).where(_on(mark, op))),
                COMMIT,
                ['refresh'],
                ['forget'],
        ],
        'col.name': (op: Op): Code[] => [
                BEGIN,
                run(sql`alter table ${id(op.page)} rename column ${id(op.col)} to ${id(op.name)}`),
                run(db.update(style).set({ col: op.name }).where(_on(style, op))),
                run(db.update(mark).set({ col: op.name }).where(_on(mark, op))),
                COMMIT,
                ['refresh'],
                ['forget'],
        ],
}
