import { readFileSync } from 'node:fs'
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
import * as SQLite from 'wa-sqlite'
import { MemoryVFS } from 'wa-sqlite/src/examples/MemoryVFS.js'

const _ORDER = { _style: '"page", "row", "col", "name"', _mark: '"page", "row", "col", "start", "name"' }
const _quote = (name) => `"${name.replaceAll('"', '""')}"`

// store の object を contract 4 節どおりに復号した file を、製品とは別の wa-sqlite (同期 build) で読む
export const createOracle = async (root) => {
        const sqlite3 = SQLite.Factory(await SQLiteESMFactory({ wasmBinary: readFileSync(`${root}/node_modules/wa-sqlite/dist/wa-sqlite.wasm`) }))
        const vfs = new MemoryVFS()
        sqlite3.vfs_register(vfs, true)
        let n = 0
        const query = async (db, sql) => {
                const out = { cols: [], rows: [] }
                await sqlite3.exec(db, sql, (row, columns) => ((out.cols = columns), out.rows.push(row)))
                return out
        }
        const inspect = async (file) => {
                const name = `o${++n}.db`
                vfs.mapNameToFile.set(name, { name, flags: 0, size: file.byteLength, data: file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) })
                const db = await sqlite3.open_v2(name, SQLite.SQLITE_OPEN_READONLY, 'memory')
                const integrity = await query(db, 'pragma integrity_check').then((r) => r.rows.map((x) => x[0]).join('; '), (e) => `error: ${e.message}`)
                const tables = await query(db, "select name from sqlite_master where type = 'table' order by rowid").then((r) => r.rows.map((x) => x[0]), () => [])
                const dump = {}
                for (const t of tables) dump[t] = await ((cols) => query(db, `select * from ${_quote(t)} order by ${_ORDER[t] ?? '"_id"'}`).then((r) => ({ cols, rows: r.rows }), (e) => ({ cols, rows: [], error: e.message })))(await query(db, `pragma table_info(${_quote(t)})`).then((r) => r.rows.map((x) => x[1]), () => []))
                return sqlite3.close(db).then(() => vfs.mapNameToFile.delete(name)).then(() => ({ integrity, tables, dump }))
        }
        return { inspect }
}
