import { quoteId } from './inspect.mjs'

const ADDED = 'bench_col'
const RENAMED = 'bench_renamed'

export const editOps = ({ page, table, col, ids, value }) => {
        const t = quoteId(table)
        const c = quoteId(col)
        const batch = ids.slice(1, 51)
        const marks = batch.map(() => '?').join(', ')
        const setCell = (db) => db.prepare(`UPDATE ${t} SET ${c} = ? WHERE rowid = ?`).run(value, ids[0])
        return [
                { name: 'cell', op: { kind: 'cell', page, row: ids[0], col, value }, sql: setCell },
                { name: 'cell_same', op: { kind: 'cell', page, row: ids[0], col, value }, sql: setCell },
                {
                        name: 'row_add',
                        op: { kind: 'row.add', page },
                        sql: (db) => db.exec(`INSERT INTO ${t} DEFAULT VALUES`),
                },
                {
                        name: 'col_add',
                        op: { kind: 'col.add', page, name: ADDED, type: 'text', width: 4 },
                        sql: (db) => db.exec(`ALTER TABLE ${t} ADD COLUMN ${quoteId(ADDED)} TEXT`),
                },
                {
                        name: 'col_rename',
                        op: { kind: 'col.rename', page, from: ADDED, to: RENAMED },
                        sql: (db) => db.exec(`ALTER TABLE ${t} RENAME COLUMN ${quoteId(ADDED)} TO ${quoteId(RENAMED)}`),
                },
                {
                        name: 'batch50',
                        op: { kind: 'clear', page, rows: batch, cols: [col] },
                        sql: (db) => db.prepare(`UPDATE ${t} SET ${c} = NULL WHERE rowid IN (${marks})`).run(...batch),
                },
        ]
}

export const EDIT_LIMITS = {
        cell: (n) => n === 1,
        cell_same: (n) => n === 0,
        row_add: (n) => n <= 2,
        col_add: (n) => n === 1,
        col_rename: (n) => n === 1,
        batch50: (n, f) => f > 0 && n <= Math.ceil(50 / f) + 3,
}
