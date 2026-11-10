import { userCols } from './edit.mjs'
import { WINDOW } from './scan.mjs'
import { guard, quote, rowsOf, valueOf } from './sql.mjs'

const _JSON = JSON.stringify({ b: 1 })

const _isLive = `substr(name, 1, 6) <> '_drop:'`

const _orphans = async (db, table, page) => {
        const rows = `SELECT _id FROM ${quote(page)}`
        const cols = `SELECT name FROM pragma_table_info(?) WHERE ${_isLive}`
        const isOrphan = `s.row NOT IN (${rows}) OR s.col NOT IN (${cols})`
        const text = `SELECT count(*) FROM ${table} s WHERE s.page = ? AND (${isOrphan})`
        return Number(await valueOf(db, text, [page, page]))
}

export const orphansOf = async (db, pages) => {
        let sum = 0
        for (const page of pages) sum += (await _orphans(db, '_style', page)) + (await _orphans(db, '_mark', page))
        return sum
}

const _badRuns = async (db, page, col) => {
        const join = `_mark m JOIN ${quote(page)} t ON t._id = m.row`
        const isBad = `m."to" > length(coalesce(t.${quote(col)}, '')) OR m."from" > m."to" OR m."from" < 0`
        const text = `SELECT count(*) FROM ${join} WHERE m.page = ? AND m.col = ? AND (${isBad})`
        return Number(await valueOf(db, text, [page, col]))
}

const _countOf = async (db, table, page) =>
        Number(await valueOf(db, `SELECT count(*) FROM ${table} WHERE page = ?`, [page]))

const _kept = async (db, page, id, col) => {
        const text = 'SELECT count(*) FROM _style WHERE page = ? AND row = ? AND col = ? AND json = ?'
        return Number(await valueOf(db, text, [page, id, col, _JSON]))
}

const _textCol = async (db, page) => {
        const schema = await db.schema()
        const col = schema.find((p) => p.page === page)?.columns.find((c) => c.type === 'text')?.name
        if (col) return col
        await db.act({ kind: 'col.add', page, name: 'bench_t', type: 'text' })
        return 'bench_t'
}

const _texts = async (db, page, col) =>
        rowsOf(await db.sql(`SELECT _id, ${quote(col)} FROM ${quote(page)} ORDER BY _id LIMIT ?`, [8]))

const _seed = async (db, page, text) => {
        const seed = await _texts(db, page, text)
        const cells = seed.map(([id, v]) => ({ row: id, col: text, value: v || 'bench text ' + id }))
        await db.act({ kind: 'cells', page, cells })
        return _texts(db, page, text)
}

const _decorate = async (db, page, rows, text, other) => {
        const styled = rows.flatMap(([id]) => [text, other].map((col) => ({ row: id, col, json: _JSON })))
        const run = (v) => [{ from: 0, to: String(v).length, attr: 'b', val: '1' }]
        const marks = rows.map(([id, v]) => ({ row: id, col: text, marks: run(v) }))
        const style = await guard(() => db.act({ kind: 'style', page, cells: styled }))
        const mark = await guard(() => db.act({ kind: 'cells', page, cells: marks }))
        const written = { styles: await _countOf(db, '_style', page), marks: await _countOf(db, '_mark', page) }
        return { style, mark, written }
}

const _empty = (db, page, text, rows) => {
        const long = String(rows[3][1])
        const short = long.slice(0, Math.max(1, Math.floor(long.length / 2)))
        const cells = [{ row: rows[2][0], col: text, value: '' }, { row: rows[3][0], col: text, value: short }]
        return guard(() => db.act({ kind: 'cells', page, cells }))
}

export const measureStyle = async (ctx) => {
        const db = ctx.sides.n.db
        const page = ctx.page
        const text = await _textCol(db, page)
        const rows = await _seed(db, page, text)
        const ids = rows.map((r) => r[0])
        const other = (await userCols(db, page)).filter((c) => c !== text).at(-1)
        const done = await _decorate(db, page, rows, text, other)
        const steps = { style: done.style, marks: done.mark }
        steps.rowRemove = await guard(() => db.act({ kind: 'row.remove', page, rows: [ids[0], ids[1]] }))
        steps.colRemove = await guard(() => db.act({ kind: 'col.remove', page, name: other }))
        steps.sort = await guard(() => db.move({ page, from: 1, to: WINDOW, order: { col: text, dir: 'desc' } }))
        steps.pos = await guard(() => db.act({ kind: 'col.set', page, name: text, pos: 1 }))
        const orphans = await orphansOf(db, ctx.intake.pages)
        steps.empty = await _empty(db, page, text, rows)
        const kept = await _kept(db, page, ids[2], text)
        const badRuns = await _badRuns(db, page, text)
        const after = await orphansOf(db, ctx.intake.pages)
        await db.move({ page, from: 1, to: WINDOW })
        const failed = Object.entries(steps).filter(([, r]) => r.error)
        const errors = Object.fromEntries(failed.map(([k, r]) => [k, r.error]))
        return { text, other, ids, written: done.written, orphans: Math.max(orphans, after), kept, badRuns, errors }
}
