import type { Row, Value } from '../utils/share/types.ts'

const INTEGER = 1

const FLOAT = 2

const TEXT = 3

const NULL = 5

const INT32 = 2 ** 31

export const createBind = (m: any) => {
        let scratch = 0
        let room = 0
        const reserve = (n: number) => {
                if (n <= room) return scratch
                m._free(scratch)
                room = Math.max(n, room * 2, 4096)
                scratch = m._malloc(room)
                return scratch
        }
        const text = (stmt: number, i: number, value: string) => {
                const n = m.lengthBytesUTF8(value) + 1
                m.stringToUTF8(value, reserve(n), n)
                return m._sqlite3_bind_text(stmt, i, scratch, n - 1, -1)
        }
        const blob = (stmt: number, i: number, bytes: Uint8Array) => {
                m.HEAPU8.set(bytes, reserve(bytes.length))
                return m._sqlite3_bind_blob(stmt, i, scratch, bytes.length, -1)
        }
        const int = (stmt: number, i: number, n: number) => {
                if (n >= -INT32 && n < INT32) return m._sqlite3_bind_int(stmt, i, n)
                const big = BigInt(n)
                return m._sqlite3_bind_int64(stmt, i, Number(BigInt.asIntN(32, big)), Number(BigInt.asIntN(32, big >> 32n)))
        }
        const one = (stmt: number, i: number, value: unknown) => {
                if (value == null) return m._sqlite3_bind_null(stmt, i)
                if (typeof value === 'number' && Number.isSafeInteger(value)) return int(stmt, i, value)
                if (typeof value === 'number') return m._sqlite3_bind_double(stmt, i, value)
                if (typeof value === 'boolean') return m._sqlite3_bind_int(stmt, i, value ? 1 : 0)
                if (value instanceof Uint8Array) return blob(stmt, i, value)
                return text(stmt, i, String(value))
        }
        const keyOf = (stmt: number, i: number) => String(m.UTF8ToString(m._sqlite3_bind_parameter_name(stmt, i))).slice(1)
        const bind = (stmt: number, params?: unknown[] | Row) => {
                const count = params ? m._sqlite3_bind_parameter_count(stmt) : 0
                const valueAt = (i: number) => (Array.isArray(params) ? params[i - 1] : params![keyOf(stmt, i)])
                for (let i = 1; i <= count; i++) one(stmt, i, valueAt(i))
        }
        const column = (stmt: number, i: number): Value | Uint8Array => {
                const type = m._sqlite3_column_type(stmt, i)
                if (type === NULL) return null
                if (type === INTEGER || type === FLOAT) return m._sqlite3_column_double(stmt, i)
                if (type === TEXT) return m.UTF8ToString(m._sqlite3_column_text(stmt, i), m._sqlite3_column_bytes(stmt, i))
                const p = m._sqlite3_column_blob(stmt, i)
                return m.HEAPU8.slice(p, p + m._sqlite3_column_bytes(stmt, i))
        }
        const names = (stmt: number) => Array.from({ length: m._sqlite3_column_count(stmt) }, (_, i) => String(m.UTF8ToString(m._sqlite3_column_name(stmt, i))))
        const row = (stmt: number, keys: string[]) => Object.fromEntries(keys.map((key, i) => [key, column(stmt, i)])) as Row
        const release = () => {
                m._free(scratch)
                scratch = room = 0
        }
        return { bind, names, row, release }
}
