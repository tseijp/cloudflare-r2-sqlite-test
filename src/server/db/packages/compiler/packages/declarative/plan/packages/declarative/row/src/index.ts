import { and, eq, sql } from 'drizzle-orm'
import { toCell, toKey, toStyle } from '@db/server-compiler-share'
import { BEGIN, COMMIT, db, id, list, mark, query, run, style } from '@db/server-compiler-plan-share'
import type { Code, Op } from '@db/server-share'

const _at = (table: typeof style | typeof mark, { page, row }: Op) => and(eq(table.page, page), eq(table.row, row))

const _in = (table: typeof style | typeof mark, op: Op) => and(_at(table, op), eq(table.col, op.col))

const _track = (op: Op, key: string, read: any, value: string, write: Code[]): Code[] => {
        if (op.isEcho) return write
        return [['fill', key, ...query(read)], ['set', key, value, op.id], ...write]
}

const _runs = ({ text, marks }: Op): any[][] => marks.map(([start, stop, name, value]: any[]) => [start, Math.min(stop, (text ?? '').length), name, value]).filter(([start, stop]: number[]) => start < stop)

const _cell = (op: Op): Code[] => [
        BEGIN,
        run(sql`update ${id(op.page)} set ${id(op.col)} = ${op.text} where "_id" = ${op.row} and ${id(op.col)} is not ${op.text}`),
        run(db.delete(mark).where(_in(mark, op))),
        ..._runs(op).map(([start, stop, name, value]) => run(sql`insert into "_mark" ("page", "row", "col", "start", "name", "stop", "value") select ${op.page}, ${op.row}, ${op.col}, ${start}, ${name}, ${stop}, ${value} where exists (select 1 from ${id(op.page)} where "_id" = ${op.row})`)),
        COMMIT,
        ['refresh'],
]

const _style = (op: Op): Code[] => {
        const isHere = sql`(${op.row} = 0 or exists (select 1 from ${id(op.page)} where "_id" = ${op.row})) and exists (select 1 from pragma_table_info(${op.page}) where "name" = ${op.col})`
        if (op.value === null) return [run(db.delete(style).where(and(_in(style, op), eq(style.name, op.name)))), ['refresh']]
        return [run(sql`insert into "_style" ("page", "row", "col", "name", "value") select ${op.page}, ${op.row}, ${op.col}, ${op.name}, ${op.value} where ${isHere} on conflict ("page", "row", "col", "name") do update set "value" = excluded."value"`), ['refresh']]
}

export const row = {
        'row.add': ({ page }: Op): Code[] => [run(sql`insert into ${id(page)} default values returning "_id"`), ['refresh']],
        'row.del': (op: Op): Code[] => [
                BEGIN,
                run(sql`delete from ${id(op.page)} where "_id" = ${op.row}`),
                run(db.delete(style).where(_at(style, op))),
                run(db.delete(mark).where(_at(mark, op))),
                COMMIT,
                ['refresh'],
                ['forget'],
        ],
        cell: (op: Op): Code[] => {
                const read = sql`select p.${id(op.col)}, m."start", m."stop", m."name", m."value" from ${id(op.page)} p left join "_mark" m on m."page" = ${op.page} and m."row" = p."_id" and m."col" = ${op.col} where p."_id" = ${op.row} order by m."start", m."name"`
                return _track(op, toKey('cell', op.page, op.row, op.col), read, toCell(op.text, _runs(op)), _cell(op))
        },
        style: (op: Op): Code[] => {
                const read = db.select({ value: style.value }).from(style).where(and(_in(style, op), eq(style.name, op.name)))
                return _track(op, toKey('style', op.page, op.row, op.col, op.name), read, toStyle(op.value), _style(op))
        },
        import: ({ page, names, rows }: Op): Code[] => [
                BEGIN,
                run(sql`create table if not exists ${id(page)} ("_id" integer primary key, ${list(names.map((name: string) => sql`${id(name)} text`))})`),
                run(sql`insert into ${id(page)} (${list(names.map(id))}) select ${list(names.map((_: string, index: number) => sql`value ->> ${index}`))} from json_each(${JSON.stringify(rows)})`),
                COMMIT,
                ['refresh'],
        ],
}
