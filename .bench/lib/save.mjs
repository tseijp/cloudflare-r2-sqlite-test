import { bump, pickCell, windowRows } from './edit.mjs'
import { pageHashes } from './image.mjs'
import { WINDOW } from './scan.mjs'
import { closeSide, openSide } from './side.mjs'
import { countOf, framesOf, guard, rowsOf, settle } from './sql.mjs'
import { getLog } from './storage.mjs'

const _shipped = async (side, op) => {
        const db = side.db
        const frames = await framesOf(db, op)
        side.storage.reset()
        const res = await guard(() => db.save())
        const count = side.storage.reset()
        const sent = count.putBytes
        const ratio = sent / Math.max(1, frames * db.pageSize)
        const isFull = res.value?.isFull ?? null
        return { frames, puts: count.put, deletes: count.delete, sent, isFull, error: res.error, ratio }
}

const _hundred = async (side, page, col) => {
        const rows = await windowRows(side.db, page, col)
        side.storage.reset()
        let fulls = 0
        let errors = 0
        for (let k = 0; k < 100; k++) {
                const [id, v] = rows[k % rows.length]
                rows[k % rows.length] = [id, bump(v)]
                await side.db.act({ kind: 'cells', page, cells: [{ row: id, col, value: bump(v) }] })
                const res = await guard(() => side.db.save())
                if (res.value?.isFull) fulls++
                if (res.error) errors++
        }
        const count = side.storage.reset()
        const objects = side.storage.keys(side.prefix).length
        return { objects, fulls, errors, puts: count.put, deletes: count.delete, sent: count.putBytes }
}

const _integrity = async (db) => rowsOf(await db.sql('PRAGMA integrity_check')).map((r) => r[0])

const _opened = (count, img, shown) => ({
        log: getLog(count),
        gets: count.get,
        getBytes: count.getBytes,
        classA: count.put + count.list + count.delete,
        share: count.getBytes / img.byteLength,
        error: shown.error,
})

const _restore = async (openDb, side, pages) => {
        const img = await side.db.bytes()
        const rows = await Promise.all(pages.map((p) => countOf(side.db, p)))
        side.storage.reset()
        const re = await openSide(openDb, side.prefix, side.storage)
        const shown = await guard(() => re.db.move({ page: pages[0], from: 1, to: WINDOW }))
        await settle()
        const open = _opened(side.storage.reset(), img, shown)
        const check = await guard(() => _integrity(re.db))
        const back = await guard(() => Promise.all(pages.map((p) => countOf(re.db, p))))
        const imgR = await guard(() => re.db.bytes())
        const a = pageHashes(img)
        const b = imgR.value ? pageHashes(imgR.value) : []
        const diff = a.filter((h, k) => h !== b[k]).length + Math.max(0, b.length - a.length)
        await closeSide(re)
        const isOk = check.value?.[0] === 'ok' && JSON.stringify(back.value) === JSON.stringify(rows) && diff === 0
        return {
                open,
                image: img.byteLength,
                integrity: check.value ?? check.error,
                rows: { saved: rows, restored: back.value ?? back.error },
                pages: { saved: a.length, restored: b.length, diff },
                isOk,
        }
}

export const measureSave = async (openDb, ctx) => {
        const side = ctx.sides.n
        const page = ctx.page
        const flush = await guard(() => side.db.save())
        const cell = await pickCell(side.db, page)
        const edit = { row: cell.id, col: cell.col, value: bump(cell.value) }
        const one = await _shipped(side, () => side.db.act({ kind: 'cells', page, cells: [edit] }))
        const rows = await windowRows(side.db, page, cell.col)
        const cells = rows.map(([id, v]) => ({ row: id, col: cell.col, value: bump(v) }))
        const bulk = await _shipped(side, () => side.db.act({ kind: 'cells', page, cells }))
        const hundred = await _hundred(side, page, cell.col)
        const restore = await _restore(openDb, side, ctx.intake.pages)
        const ratio = Math.max(one.ratio, bulk.ratio)
        const puts = Math.max(one.puts, bulk.puts)
        return { flush: flush.value ?? flush.error, one, bulk, hundred, restore, ratio, puts }
}
