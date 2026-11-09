import { createVfs } from './vfs'
import { bootSqlite, scanWal, stepSql } from '../procedural/exec/index'
import { flatFile, pagedFile } from '../procedural/vfs/index'
import type { Dirty, File, Load, Q } from '../procedural/share/types'

interface _Config {
        pageSize: number
        ahead: number
        widest: number
        commit: number
        load?: Load
        wasm?: WebAssembly.Module
}

const _SETUP = ['PRAGMA locking_mode = EXCLUSIVE', 'PRAGMA journal_mode = WAL', 'PRAGMA temp_store = MEMORY']

const _files = new Map<string, File>()

let _booting: Promise<any> | null = null

let _seq = 0

export const createEngine = async (config: _Config) => {
        const _sqlite3 = await (_booting ??= bootSqlite(config.wasm, createVfs(_files)))
        const _name = `db${++_seq}`
        const _main = pagedFile(config.pageSize, config.commit)
        let _off = 0
        let _commit = config.commit
        let _version = 0
        let _dirty = new Map<number, Uint8Array>()
        let _tail: Promise<unknown> = Promise.resolve()
        const _wal = flatFile(() => void (_off = 0))
        const _fill = async (pgnos: number[] | null, ahead: number) => {
                const got = await config.load!(pgnos, (pgno) => _main.pages.has(pgno), ahead)
                for (const [pgno, data] of got) if (!_main.pages.has(pgno)) _main.pages.set(pgno, data)
        }
        _files.set(_name, _main)
        _files.set(`${_name}-wal`, _wal)
        if (config.load && config.commit) await _fill([1], config.ahead)
        const _db = await _sqlite3.open_v2(_name, 6, 'grid')
        const _q: Q = (text, params, limit) => stepSql(_sqlite3, _db, text, params, limit)
        const _capture = () => {
                const scanned = scanWal(_wal, config.pageSize, _off)
                for (const [pgno, data] of scanned.frames) _dirty.set(pgno, data)
                _commit = scanned.commit || _commit
                _version += scanned.commit ? 1 : 0
                _off = scanned.end
        }
        const _atomic = async <T,>(fn: (q: Q) => Promise<T>) => {
                await _q('BEGIN IMMEDIATE')
                return fn(_q).then(
                        (value) => _q('COMMIT').then(() => value),
                        (error) => _q('ROLLBACK').then(() => Promise.reject(error), () => Promise.reject(error)),
                )
        }
        const _attempt = async <T,>(fn: (q: Q) => Promise<T>, isWrite: boolean, tries: number): Promise<T> => {
                const settled = await (isWrite ? _atomic(fn) : fn(_q)).then((value) => ({ value }), (error) => ({ error }))
                const misses = [..._main.miss]
                _main.miss.clear()
                const isRetry = misses.length > 0 && !!config.load
                if (isRetry) return _fill(misses, Math.min(config.widest, config.ahead * 2 ** tries)).then(() => _attempt(fn, isWrite, tries + 1))
                _capture()
                return 'error' in settled ? Promise.reject(settled.error) : settled.value
        }
        const run = <T,>(fn: (q: Q) => Promise<T>, isWrite = false): Promise<T> => {
                const out = _tail.then(() => _attempt(fn, isWrite, 0))
                _tail = out.catch(() => null)
                return out
        }
        await run(async (q) => {
                for (const text of _SETUP) await q(text)
        })
        return {
                run,
                pageSize: config.pageSize,
                version() {
                        return _version
                },
                take(): Dirty {
                        const pages = [..._dirty].filter(([pgno]) => pgno <= _commit).sort((a, b) => a[0] - b[0])
                        _dirty = new Map()
                        return { pageSize: config.pageSize, commit: _commit, pages }
                },
                bytes(isTake = false) {
                        return run(async (q) => {
                                if (config.load) await _fill(null, 0)
                                await q('PRAGMA wal_checkpoint(TRUNCATE)')
                                const out = new Uint8Array(_main.size)
                                for (const [pgno, page] of _main.pages) if (pgno * config.pageSize <= _main.size) out.set(page, (pgno - 1) * config.pageSize)
                                if (isTake) _dirty = new Map()
                                return out
                        })
                },
                close() {
                        _sqlite3.close(_db)
                        _files.delete(_name)
                        _files.delete(`${_name}-wal`)
                },
        }
}

export type Engine = Awaited<ReturnType<typeof createEngine>>
