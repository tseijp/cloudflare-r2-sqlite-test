import { DROP, KIND_OF, RESERVED, SQL_TYPE, SYSTEM } from './utils/share/const'
import { normalize } from './utils/value/value'
import type { ColType, Column, Described, Value } from '../utils/share/types'
import type { Sql } from './sql'

const _COMMENT = /"((?:[^"]|"")*)"\s*\/\*(\w+)\*\//g

export const quote = (name: string) => `"${String(name).replace(/"/g, '""')}"`

const _literal = (value: Value) => (typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "''")}'`)

const _parseDefault = (text: unknown): Value => {
        if (text == null || text === 'NULL') return null
        const raw = String(text)
        if (raw.startsWith("'")) return raw.slice(1, -1).replace(/''/g, "'")
        const n = Number(raw)
        return Number.isFinite(n) ? n : raw
}

export const columnSql = (col: Column) => {
        const value = normalize(col.type, col.default)
        const notNull = col.optional ? '' : ' NOT NULL'
        const dflt = value == null ? '' : ` DEFAULT ${_literal(value)}`
        return `${quote(col.name)} /*${col.type}*/ ${SQL_TYPE[col.type]}${notNull}${dflt}`
}

const _kindsOf = (ddl: string) => new Map([...ddl.matchAll(_COMMENT)].map((m) => [m[1].replace(/""/g, '"'), m[2] as ColType]))

const _isUser = (name: string) => !SYSTEM.includes(name) && !name.startsWith(DROP)

export const createColumns = (sql: Sql) => {
        let _version = -1
        let _cache = new Map<string, Described[]>()
        const _physical = (page: string) => sql.query('SELECT name, type, "notnull", dflt_value FROM pragma_table_info(?)', [page]).rows
        const _load = (page: string): Described[] => {
                const ddl = sql.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", [page]).rows[0]?.sql
                const kinds = _kindsOf(String(ddl ?? ''))
                return _physical(page)
                        .filter((c) => _isUser(String(c.name)))
                        .map((c) => ({
                                name: String(c.name),
                                type: kinds.get(String(c.name)) ?? KIND_OF[String(c.type)] ?? 'text',
                                default: _parseDefault(c.dflt_value),
                                optional: !c.notnull,
                        }))
        }
        const columns = (page: string) => {
                const now = Number(sql.query('PRAGMA schema_version').rows[0].schema_version)
                if (now !== _version) _cache = new Map()
                _version = now
                return _cache.get(page) ?? _cache.set(page, _load(page)).get(page)!
        }
        const pages = () =>
                sql
                        .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY rowid")
                        .rows.map((r) => String(r.name))
                        .filter((name) => !RESERVED.includes(name))
        return {
                columns,
                names: (page: string) => columns(page).map((c) => c.name),
                kindOf: (page: string, name: string) => columns(page).find((c) => c.name === name)?.type ?? 'text',
                pages,
                hidden: () =>
                        pages().flatMap((page) =>
                                _physical(page)
                                        .filter((c) => String(c.name).startsWith(DROP))
                                        .map((c) => ({ page, col: String(c.name) })),
                        ),
                present: (page: string) => new Set(_physical(page).map((c) => String(c.name))),
        }
}

export type Columns = ReturnType<typeof createColumns>
