import { DECO, DROP, MARK, STYLE, SYSTEM_DDL } from './utils/const/const.ts'
import { columnSql, quote } from './ddl.ts'
import { normalize } from './utils/value/value.ts'
import type { CellOp, ClearOp, ColAddOp, ColHideOp, ColRenameOp, Mark, Op, RowAddOp, RowRemoveOp, Sheet, StyleOp } from '../utils/share/types.ts'
import type { Columns } from './ddl.ts'
import type { Sql } from './sql.ts'

const json = (list: unknown[]) => JSON.stringify(list)

const clamp = (marks: Mark[], length: number) => marks.map((m) => ({ ...m, from: Math.max(0, m.from), to: Math.min(m.to, length) })).filter((m) => m.from < m.to)

export const createEdit = ({ query }: Sql, cols: Columns, stamp: () => number) => {
        const unmark = (page: string, rows: number[], names: string[]) => query(`DELETE FROM ${MARK} WHERE page = ? AND row IN (SELECT value FROM json_each(?)) AND col IN (SELECT value FROM json_each(?))`, [page, json(rows), json(names)])
        const mark = (op: CellOp, m: Mark) => query(`INSERT OR REPLACE INTO ${MARK} (page, row, col, "from", attr, "to", val) VALUES (?, ?, ?, ?, ?, ?, ?)`, [op.page, op.row, op.col, m.from, m.attr, m.to, m.val])
        const isRow = (page: string, row: number) => query(`SELECT 1 FROM ${quote(page)} WHERE "_id" = ?`, [row]).rows.length > 0
        const cell = (op: CellOp) => {
                const value = normalize(cols.kindOf(op.page, op.col), op.value)
                const col = quote(op.col)
                const { changes } = query(`UPDATE ${quote(op.page)} SET ${col} = ?, "_up" = unixepoch() WHERE "_id" = ? AND ${col} IS NOT ?`, [value, op.row, value])
                if (!changes && (!op.marks || !isRow(op.page, op.row))) return
                unmark(op.page, [op.row], [op.col])
                clamp(op.marks ?? [], value == null ? 0 : String(value).length).forEach((m) => mark(op, m))
        }
        const clear = (op: ClearOp) => {
                if (!op.cols.length || !op.rows.length) return
                const sets = op.cols.map((c) => `${quote(c)} = NULL`).join(', ')
                const isAny = op.cols.map((c) => `${quote(c)} IS NOT NULL`).join(' OR ')
                query(`UPDATE ${quote(op.page)} SET ${sets}, "_up" = unixepoch() WHERE "_id" IN (SELECT value FROM json_each(?)) AND (${isAny})`, [json(op.rows)])
                unmark(op.page, op.rows, op.cols)
        }
        const rowAdd = (op: RowAddOp) => {
                const entries = Object.entries(op.values ?? {})
                const names = ['"_at"', ...entries.map(([name]) => quote(name))].join(', ')
                const marks = ['unixepoch()', ...entries.map(() => '?')].join(', ')
                query(
                        `INSERT INTO ${quote(op.page)} (${names}) VALUES (${marks})`,
                        entries.map(([name, v]) => normalize(cols.kindOf(op.page, name), v)),
                )
        }
        const rowRemove = (op: RowRemoveOp) => {
                query(`DELETE FROM ${quote(op.page)} WHERE "_id" = ?`, [op.row])
                DECO.forEach((table) => query(`DELETE FROM ${table} WHERE page = ? AND row = ?`, [op.page, op.row]))
        }
        const colAdd = (op: ColAddOp) => query(`ALTER TABLE ${quote(op.page)} ADD COLUMN ${columnSql({ name: op.name, type: op.type, optional: true })}`)
        const rename = (page: string, from: string, to: string) => query(`ALTER TABLE ${quote(page)} RENAME COLUMN ${quote(from)} TO ${quote(to)}`)
        const colRename = (op: ColRenameOp) => {
                rename(op.page, op.from, op.to)
                DECO.forEach((table) => query(`UPDATE ${table} SET col = ? WHERE page = ? AND col = ?`, [op.to, op.page, op.from]))
        }
        const colHide = (op: ColHideOp) => {
                rename(op.page, op.name, `${DROP}${stamp()}:${op.name}`)
                DECO.forEach((table) => query(`DELETE FROM ${table} WHERE page = ? AND col = ?`, [op.page, op.name]))
        }
        const style = (op: StyleOp) => {
                if (op.json == null) return void query(`DELETE FROM ${STYLE} WHERE page = ? AND row = ? AND col = ?`, [op.page, op.row, op.col])
                if (!cols.names(op.page).includes(op.col)) return
                query(`INSERT INTO ${STYLE} (page, row, col, json) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM ${quote(op.page)} WHERE "_id" = ?) ON CONFLICT DO UPDATE SET json = excluded.json WHERE json IS NOT excluded.json`, [op.page, op.row, op.col, op.json, op.row])
        }
        const EDIT: Record<Op['kind'], (op: any) => unknown> = {
                cell,
                clear,
                'row.add': rowAdd,
                'row.remove': rowRemove,
                'col.add': colAdd,
                'col.rename': colRename,
                'col.hide': colHide,
                style,
        }
        const edit = (op: Op) => void EDIT[op.kind](op)
        const declare = (sheet: Sheet) => {
                const have = cols.present(sheet.name)
                const table = quote(sheet.name)
                if (!have.has('_id')) return void query(`CREATE TABLE ${table} (${[SYSTEM_DDL, ...sheet.columns.map(columnSql)].join(', ')})`)
                sheet.columns.filter((c) => !have.has(c.name)).forEach((c) => query(`ALTER TABLE ${table} ADD COLUMN ${columnSql(c)}`))
        }
        const drop = () => cols.hidden().forEach(({ page, col }) => query(`ALTER TABLE ${quote(page)} DROP COLUMN ${quote(col)}`))
        return { edit, declare, drop }
}
