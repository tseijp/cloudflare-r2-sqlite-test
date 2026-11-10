// @ts-ignore
import factory from 'wa-sqlite/dist/wa-sqlite.mjs'
import * as SQLite from 'wa-sqlite'
import type { Flat, Result, Value } from '../share/types'

const _WAL_HEADER = 32

const _FRAME_HEADER = 24

const _compile = (): WebAssembly.Module => {
        const fs = (globalThis as any).process.getBuiltinModule('node:fs')
        return new WebAssembly.Module(fs.readFileSync(new URL(import.meta.resolve('wa-sqlite/dist/wa-sqlite.wasm'))))
}

const _plain = (value: unknown) => (typeof value === 'bigint' ? Number(value) : value) as Value

export const bootSqlite = async (wasm: WebAssembly.Module | undefined, vfs: object) => {
        const module = await factory({
                locateFile: () => 'wa-sqlite.wasm',
                instantiateWasm: (imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) => {
                        const instance = new WebAssembly.Instance(wasm ?? _compile(), imports)
                        done(instance)
                        return instance.exports
                },
        })
        const sqlite3 = SQLite.Factory(module)
        sqlite3.vfs_register(vfs as any, false)
        return sqlite3
}

export const stepSql = async (sqlite3: any, db: number, text: string, params: Value[] = [], limit = Infinity): Promise<Result> => {
        let cols: string[] = []
        let rows: Value[][] = []
        for await (const stmt of sqlite3.statements(db, text)) {
                if (params.length) sqlite3.bind_collection(stmt, params)
                cols = sqlite3.column_names(stmt)
                rows = []
                while (rows.length < limit && (await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) rows.push(sqlite3.row(stmt).map(_plain))
        }
        return { cols, rows, changes: sqlite3.changes(db) }
}

const _isFrame = (view: DataView, at: number, size: number) => {
        const isRoom = view.byteLength >= _WAL_HEADER && at + size <= view.byteLength
        return isRoom && view.getUint32(at + 8) === view.getUint32(16) && view.getUint32(at + 12) === view.getUint32(20)
}

export const scanWal = (wal: Flat, pageSize: number, from: number) => {
        const size = _FRAME_HEADER + pageSize
        const view = new DataView(wal.data.buffer, wal.data.byteOffset, wal.size)
        const pending: [number, Uint8Array][] = []
        const frames: [number, Uint8Array][] = []
        let at = Math.max(from, _WAL_HEADER)
        let end = at
        let commit = 0
        while (_isFrame(view, at, size)) {
                pending.push([view.getUint32(at), wal.data.slice(at + _FRAME_HEADER, at + size)])
                const pages = view.getUint32(at + 4)
                at += size
                if (!pages) continue
                for (const frame of pending) frames.push(frame)
                pending.length = 0
                commit = pages
                end = at
        }
        return { frames, commit, end }
}
