import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sha256 } from './hash.mjs'

export const quoteId = (name) => `"${String(name).replace(/"/g, '""')}"`

export const pageHashes = (bytes) => {
        const raw = bytes[16] * 256 + bytes[17]
        const size = raw === 1 ? 65536 : raw
        const parts = []
        for (let o = 0; o < bytes.length; o += size) parts.push(sha256(bytes.subarray(o, o + size)))
        return parts
}

const SHAPE = `SELECT pagetype, count(*) n, avg(ncell) f, max(length(path) - length(replace(path, '/', ''))) d
        FROM dbstat WHERE name = ? GROUP BY pagetype`

export const shapeOf = (db, table) => {
        const rows = db.prepare(SHAPE).all(table)
        const leaf = rows.find((r) => r.pagetype === 'leaf') ?? { n: 0, f: 0 }
        const overflow = rows.find((r) => r.pagetype === 'overflow') ?? { n: 0 }
        return { f: leaf.f, depth: Math.max(1, ...rows.map((r) => r.d)), leaves: leaf.n, overflow: overflow.n }
}

export const openFile = (bytes) => {
        const dir = mkdtempSync(join(tmpdir(), 'bench-'))
        const file = join(dir, 'image.db')
        if (bytes) writeFileSync(file, bytes)
        const db = new DatabaseSync(file)
        const close = () => {
                db.close()
                rmSync(dir, { recursive: true, force: true })
        }
        return { db, file, close }
}

export const describeImage = (bytes, table) => {
        const { db, close } = openFile(bytes)
        const tables = db
                .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
                .all()
                .map((r) => r.name)
        const isFound = tables.includes(table)
        const rows = isFound ? db.prepare(`SELECT count(*) n FROM ${quoteId(table)}`).get().n : null
        const shape = isFound ? shapeOf(db, table) : { f: 0, depth: 0, leaves: 0, overflow: 0 }
        close()
        return { table: isFound ? table : null, tables, rows, ...shape, bytes: bytes.length }
}
