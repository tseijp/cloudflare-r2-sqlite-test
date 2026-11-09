import { createBind } from './bind.ts'
import { CACHE } from './utils/config/config.ts'
import type { Result, Row } from '../utils/share/types.ts'

const ROW = 100

const DONE = 101

const cstr = (m: any, text: string) => {
        const n = m.lengthBytesUTF8(text) + 1
        const p = m._malloc(n)
        m.stringToUTF8(text, p, n)
        return p
}

const pointer = (m: any, fn: (pp: number) => number) => {
        const pp = m._malloc(4)
        const rc = fn(pp)
        const p = m.getValue(pp, 'i32') as number
        m._free(pp)
        return { rc, p }
}

const check = (m: any, db: number, rc: number) => {
        if (rc === 0) return
        throw new Error(`sqlite ${rc}: ${m.UTF8ToString(m._sqlite3_errmsg(db))}`)
}

export const openDb = (m: any, name: string, vfs: string) => {
        const zName = cstr(m, name)
        const zVfs = cstr(m, vfs)
        const { rc, p } = pointer(m, (pp) => m._sqlite3_open_v2(zName, pp, 6, zVfs))
        m._free(zName)
        m._free(zVfs)
        check(m, p, rc)
        return p
}

export const createSql = (m: any, handle: number) => {
        let db = handle
        const cache = new Map<string, number>()
        const { bind, names, row, release } = createBind(m)
        const finalize = () => {
                cache.forEach((stmt) => m._sqlite3_finalize(stmt))
                cache.clear()
        }
        const compile = (text: string) => {
                const z = cstr(m, text)
                const { rc, p } = pointer(m, (pp) => m._sqlite3_prepare_v2(db, z, -1, pp, 0))
                m._free(z)
                check(m, db, rc)
                return p
        }
        const take = (text: string) => {
                const stmt = cache.get(text)
                cache.delete(text)
                if (stmt) return stmt
                if (cache.size >= CACHE) finalize()
                return compile(text)
        }
        const finish = (stmt: number, rc: number) => {
                const isFailed = rc !== ROW && rc !== DONE
                if (isFailed) check(m, db, m._sqlite3_finalize(stmt) || rc)
                m._sqlite3_reset(stmt)
                m._sqlite3_clear_bindings(stmt)
        }
        const query = (text: string, params?: unknown[] | Row, limit = Infinity): Result => {
                const stmt = take(text)
                const rows: Row[] = []
                bind(stmt, params)
                let rc = m._sqlite3_step(stmt)
                const keys = names(stmt)
                while (rc === ROW && rows.length < limit) {
                        rows.push(row(stmt, keys))
                        if (rows.length < limit) rc = m._sqlite3_step(stmt)
                }
                const changes = keys.length ? 0 : (m._sqlite3_changes(db) as number)
                finish(stmt, rc)
                cache.set(text, stmt)
                return { rows, changes }
        }
        const isIdle = () => m._sqlite3_get_autocommit(db) !== 0
        const close = () => {
                if (!db) return
                finalize()
                release()
                m._sqlite3_close(db)
                db = 0
        }
        return { query, isIdle, close }
}

export type Sql = ReturnType<typeof createSql>
