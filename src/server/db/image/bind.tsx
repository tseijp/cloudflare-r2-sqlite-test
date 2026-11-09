import type { Row, Value } from '../utils/share/types'

const _INTEGER = 1

const _FLOAT = 2

const _TEXT = 3

const _NULL = 5

const _INT32 = 2 ** 31

export const createBind = (m: any) => {
        let _scratch = 0
        let _room = 0
        const _reserve = (n: number) => {
                if (n <= _room) return _scratch
                m._free(_scratch)
                _room = Math.max(n, _room * 2, 4096)
                _scratch = m._malloc(_room)
                return _scratch
        }
        const _text = (stmt: number, i: number, value: string) => {
                const n = m.lengthBytesUTF8(value) + 1
                m.stringToUTF8(value, _reserve(n), n)
                return m._sqlite3_bind_text(stmt, i, _scratch, n - 1, -1)
        }
        const _blob = (stmt: number, i: number, bytes: Uint8Array) => {
                m.HEAPU8.set(bytes, _reserve(bytes.length))
                return m._sqlite3_bind_blob(stmt, i, _scratch, bytes.length, -1)
        }
        const _int = (stmt: number, i: number, n: number) => {
                if (n >= -_INT32 && n < _INT32) return m._sqlite3_bind_int(stmt, i, n)
                const big = BigInt(n)
                return m._sqlite3_bind_int64(stmt, i, Number(BigInt.asIntN(32, big)), Number(BigInt.asIntN(32, big >> 32n)))
        }
        const _one = (stmt: number, i: number, value: unknown) => {
                if (value == null) return m._sqlite3_bind_null(stmt, i)
                if (typeof value === 'number' && Number.isSafeInteger(value)) return _int(stmt, i, value)
                if (typeof value === 'number') return m._sqlite3_bind_double(stmt, i, value)
                if (typeof value === 'boolean') return m._sqlite3_bind_int(stmt, i, value ? 1 : 0)
                if (value instanceof Uint8Array) return _blob(stmt, i, value)
                return _text(stmt, i, String(value))
        }
        const _keyOf = (stmt: number, i: number) => String(m.UTF8ToString(m._sqlite3_bind_parameter_name(stmt, i))).slice(1)
        const _column = (stmt: number, i: number): Value | Uint8Array => {
                const type = m._sqlite3_column_type(stmt, i)
                if (type === _NULL) return null
                if (type === _INTEGER || type === _FLOAT) return m._sqlite3_column_double(stmt, i)
                if (type === _TEXT) return m.UTF8ToString(m._sqlite3_column_text(stmt, i), m._sqlite3_column_bytes(stmt, i))
                const p = m._sqlite3_column_blob(stmt, i)
                return m.HEAPU8.slice(p, p + m._sqlite3_column_bytes(stmt, i))
        }
        return {
                bind: (stmt: number, params?: unknown[] | Row) => {
                        const count = params ? m._sqlite3_bind_parameter_count(stmt) : 0
                        const valueAt = (i: number) => (Array.isArray(params) ? params[i - 1] : params![_keyOf(stmt, i)])
                        for (let i = 1; i <= count; i++) _one(stmt, i, valueAt(i))
                },
                names: (stmt: number) => Array.from({ length: m._sqlite3_column_count(stmt) }, (_, i) => String(m.UTF8ToString(m._sqlite3_column_name(stmt, i)))),
                row: (stmt: number, keys: string[]) => Object.fromEntries(keys.map((key, i) => [key, _column(stmt, i)])) as Row,
                release: () => {
                        m._free(_scratch)
                        _scratch = _room = 0
                },
        }
}
