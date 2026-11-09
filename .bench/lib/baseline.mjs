import { statSync } from 'node:fs'
import { openFile, quoteId, shapeOf } from './inspect.mjs'
import { attempt } from './product.mjs'

const SQL_TYPE = { int: 'INTEGER', number: 'REAL', text: 'TEXT' }

const ddlOf = (page) => {
        const cols = page.columns.map((c) => `, ${quoteId(c.name)} ${SQL_TYPE[c.type] ?? 'TEXT'}`)
        return `CREATE TABLE ${quoteId(page.name)} ("_id" INTEGER PRIMARY KEY${cols.join('')})`
}

const insertOf = (page) => {
        const names = page.columns.map((c) => quoteId(c.name)).join(', ')
        const marks = page.columns.map(() => '?').join(', ')
        return `INSERT INTO ${quoteId(page.name)} (${names}) VALUES (${marks})`
}

const loadPage = (db, page) => {
        db.exec(ddlOf(page))
        const stmt = db.prepare(insertOf(page))
        for (const row of page.rows) stmt.run(...row)
}

export const createBaseline = ({ pages, bytes }, pageSize) => {
        const { file, db, close } = openFile(bytes)
        if (!bytes) db.exec(`PRAGMA page_size = ${pageSize}`)
        db.exec('PRAGMA journal_mode = WAL')
        db.exec('PRAGMA synchronous = OFF')
        const t0 = performance.now()
        db.exec('BEGIN')
        for (const page of pages ?? []) loadPage(db, page)
        db.exec('COMMIT')
        const ms = performance.now() - t0
        const size = db.prepare('PRAGMA page_size').get().page_size
        const checkpoint = () => db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
        const walFrames = () => Math.max(0, Math.round((statSync(file + '-wal').size - 32) / (24 + size)))
        const frames = async (run) => {
                checkpoint()
                const done = await attempt(() => run(db))
                return { frames: done.ok ? walFrames() : null, error: done.error }
        }
        const bytesOf = () => {
                checkpoint()
                return statSync(file).size
        }
        const shape = (table) => shapeOf(db, table)
        return { ms, page_size: size, frames, size: bytesOf, shape, close }
}
