import { createBind } from './bind.ts'
import { CACHE } from './utils/config/config.ts'
import type { Result, Row } from '../utils/share/types.ts'

const _ROW = 100

const _DONE = 101

const _cstr = (m: any, text: string) => {
        const n = m.lengthBytesUTF8(text) + 1
        const p = m._malloc(n)
        m.stringToUTF8(text, p, n)
        return p
}

const _pointer = (m: any, fn: (pp: number) => number) => {
        const pp = m._malloc(4)
        const rc = fn(pp)
        const p = m.getValue(pp, 'i32') as number
        m._free(pp)
        return { rc, p }
}

const _check = (m: any, db: number, rc: number) => {
        if (rc === 0) return
        throw new Error(`sqlite ${rc}: ${m.UTF8ToString(m._sqlite3_errmsg(db))}`)
}

export const openDb = (m: any, name: string, vfs: string) => {
        const zName = _cstr(m, name)
        const zVfs = _cstr(m, vfs)
        const { rc, p } = _pointer(m, (pp) => m._sqlite3_open_v2(zName, pp, 6, zVfs))
        m._free(zName)
        m._free(zVfs)
        _check(m, p, rc)
        return p
}

export const createSql = (m: any, handle: number) => {
        let _db = handle
        const _cache = new Map<string, number>()
        const { bind: _bind, names: _names, row: _row, release: _release } = createBind(m)
        const _finalize = () => {
                _cache.forEach((stmt) => m._sqlite3_finalize(stmt))
                _cache.clear()
        }
        const _compile = (text: string) => {
                const z = _cstr(m, text)
                const { rc, p } = _pointer(m, (pp) => m._sqlite3_prepare_v2(_db, z, -1, pp, 0))
                m._free(z)
                _check(m, _db, rc)
                return p
        }
        const _take = (text: string) => {
                const stmt = _cache.get(text)
                _cache.delete(text)
                if (stmt) return stmt
                if (_cache.size >= CACHE) _finalize()
                return _compile(text)
        }
        const _finish = (stmt: number, rc: number) => {
                const isFailed = rc !== _ROW && rc !== _DONE
                if (isFailed) _check(m, _db, m._sqlite3_finalize(stmt) || rc)
                m._sqlite3_reset(stmt)
                m._sqlite3_clear_bindings(stmt)
        }
        return {
                query: (text: string, params?: unknown[] | Row, limit = Infinity): Result => {
                        const stmt = _take(text)
                        const rows: Row[] = []
                        _bind(stmt, params)
                        let rc = m._sqlite3_step(stmt)
                        const keys = _names(stmt)
                        while (rc === _ROW && rows.length < limit) {
                                rows.push(_row(stmt, keys))
                                if (rows.length < limit) rc = m._sqlite3_step(stmt)
                        }
                        const changes = keys.length ? 0 : (m._sqlite3_changes(_db) as number)
                        _finish(stmt, rc)
                        _cache.set(text, stmt)
                        return { rows, changes }
                },
                isIdle: () => m._sqlite3_get_autocommit(_db) !== 0,
                close: () => {
                        if (!_db) return
                        _finalize()
                        _release()
                        m._sqlite3_close(_db)
                        _db = 0
                },
        }
}

export type Sql = ReturnType<typeof createSql>
