import { DROP, KIND_OF, RESERVED, SQL_TYPE, SYSTEM } from './utils/share/const.ts'
import { normalize } from './utils/value/value.ts'
import type { ColType, Column, Described, Value } from '../utils/share/types.ts'
import type { Sql } from './sql.ts'

const COMMENT = /"((?:[^"]|"")*)"\s*\/\*(\w+)\*\//g

export const quote = (name: string) => `"${String(name).replace(/"/g, '""')}"`

const literal = (value: Value) => (typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "''")}'`)

const parseDefault = (text: unknown): Value => {
        if (text == null || text === 'NULL') return null
        const raw = String(text)
        if (raw.startsWith("'")) return raw.slice(1, -1).replace(/''/g, "'")
        const n = Number(raw)
        return Number.isFinite(n) ? n : raw
}

export const columnSql = (col: Column) => {
        const value = normalize(col.type, col.default)
        const notNull = col.optional ? '' : ' NOT NULL'
        const dflt = value == null ? '' : ` DEFAULT ${literal(value)}`
        return `${quote(col.name)} /*${col.type}*/ ${SQL_TYPE[col.type]}${notNull}${dflt}`
}

const kindsOf = (ddl: string) => new Map([...ddl.matchAll(COMMENT)].map((m) => [m[1].replace(/""/g, '"'), m[2] as ColType]))

const isUser = (name: string) => !SYSTEM.includes(name) && !name.startsWith(DROP)

export const createColumns = (sql: Sql) => {
        let version = -1
        let cache = new Map<string, Described[]>()
        const physical = (page: string) => sql.query('SELECT name, type, "notnull", dflt_value FROM pragma_table_info(?)', [page]).rows
        const load = (page: string): Described[] => {
                const ddl = sql.query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", [page]).rows[0]?.sql
                const kinds = kindsOf(String(ddl ?? ''))
                return physical(page)
                        .filter((c) => isUser(String(c.name)))
                        .map((c) => ({
                                name: String(c.name),
                                type: kinds.get(String(c.name)) ?? KIND_OF[String(c.type)] ?? 'text',
                                default: parseDefault(c.dflt_value),
                                optional: !c.notnull,
                        }))
        }
        const columns = (page: string) => {
                const now = Number(sql.query('PRAGMA schema_version').rows[0].schema_version)
                if (now !== version) cache = new Map()
                version = now
                return cache.get(page) ?? cache.set(page, load(page)).get(page)!
        }
        const names = (page: string) => columns(page).map((c) => c.name)
        const kindOf = (page: string, name: string) => columns(page).find((c) => c.name === name)?.type ?? 'text'
        const pages = () =>
                sql
                        .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY rowid")
                        .rows.map((r) => String(r.name))
                        .filter((name) => !RESERVED.includes(name))
        const hidden = () =>
                pages().flatMap((page) =>
                        physical(page)
                                .filter((c) => String(c.name).startsWith(DROP))
                                .map((c) => ({ page, col: String(c.name) })),
                )
        const present = (page: string) => new Set(physical(page).map((c) => String(c.name)))
        return { columns, names, kindOf, pages, hidden, present }
}

export type Columns = ReturnType<typeof createColumns>
