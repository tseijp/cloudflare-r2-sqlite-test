import { WINDOW } from './scan.mjs'
import { changedOwners } from './owner.mjs'
import { framesOf, guard, physicalOf, quote, rowsOf } from './sql.mjs'

export const bump = (v) => {
        if (v === null || v === undefined || v === '') return '1'
        if (typeof v === 'number') return String(v + 1)
        const s = String(v)
        return s.slice(0, -1) + (s.at(-1) === 'a' ? 'b' : 'a')
}

export const userCols = async (db, page) =>
        (await physicalOf(db, page)).filter((c) => c !== '_id' && !c.startsWith('_drop:'))

export const windowRows = async (db, page, col, limit = WINDOW) =>
        rowsOf(await db.sql(`SELECT _id, ${quote(col)} FROM ${quote(page)} ORDER BY _id LIMIT ?`, [limit]))

export const valueAt = async (db, page, id, col) =>
        rowsOf(await db.sql(`SELECT ${quote(col)} FROM ${quote(page)} WHERE _id = ?`, [id]))[0]?.[0]

export const pickCell = async (db, page) => {
        const cols = await userCols(db, page)
        const [row] = rowsOf(await db.sql(`SELECT * FROM ${quote(page)} ORDER BY _id LIMIT 1`))
        const all = await physicalOf(db, page)
        const col = cols.find((c) => row[all.indexOf(c)] !== null && row[all.indexOf(c)] !== '') ?? cols[0]
        return { id: row[all.indexOf('_id')], col, value: row[all.indexOf(col)] }
}

const _frames = async (db, op) => {
        const before = await db.bytes()
        const res = await guard(() => framesOf(db, () => db.act(op)))
        const pages = changedOwners(before, await db.bytes())
        return res.error ? { frames: null, error: res.error, pages } : { frames: res.value, pages }
}

const _cell = (page, id, col, value) => ({ kind: 'cells', page, cells: [{ row: id, col, value }] })

export const measureEdit = async (ctx) => {
        const db = ctx.sides.n.db
        const page = ctx.page
        const f = ctx.intake.tree.n.f
        const cell = await pickCell(db, page)
        const one = await _frames(db, _cell(page, cell.id, cell.col, bump(cell.value)))
        const now = await valueAt(db, page, cell.id, cell.col)
        const same = await _frames(db, _cell(page, cell.id, cell.col, String(now)))
        const rowAdd = await _frames(db, { kind: 'row.add', page })
        const colAdd = await _frames(db, { kind: 'col.add', page, name: 'bench_c', type: 'text' })
        const rename = await _frames(db, { kind: 'col.set', page, name: 'bench_c', to: 'bench_r' })
        const rows = await windowRows(db, page, cell.col)
        const cells = rows.map(([id, v]) => ({ row: id, col: cell.col, value: bump(v) }))
        const bulk = await _frames(db, { kind: 'cells', page, cells })
        const isApplied = String(now) === bump(cell.value) || Number(now) === Number(bump(cell.value))
        return {
                cell: { id: cell.id, col: cell.col, from: cell.value, to: now },
                isApplied,
                one,
                same,
                rowAdd,
                colAdd,
                rename,
                bulk: { ...bulk, cells: cells.length, limit: Math.ceil(cells.length / f) + 3, f },
        }
}
