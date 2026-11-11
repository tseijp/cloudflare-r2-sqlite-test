import { quote } from '@test/server-share'
import { hash } from './hash.ts'
import type { Db } from '@test/server-share'

type Rows = unknown[][]

const _BATCH = 2000

const _TABLES = `select "name", "sql" from "sqlite_master" where "type" = 'table' order by "name"`

const _STYLES = 'select "name", "value" from "_style" where "page" = ? and "row" = ? and "col" = ? order by "name"'

const _sql = (db: Db, text: string, params: unknown[] = []) => db.execute([['sql', text, params]]) as Promise<Rows>

// page table は _id の順に区切って読み、他の table は先頭 2 列の順に読む
const _table = async (db: Db, name: string, schema: unknown) => {
        const cols = await _sql(db, 'select "name" from pragma_table_info(?)', [name])
        const seed = hash(JSON.stringify([name, schema]))
        const part = `select * from ${quote(name)} where "_id" > ? order by "_id" limit ?`
        if (!cols.some(([col]) => col === '_id')) {
                const rows = await _sql(db, `select * from ${quote(name)} order by 1, 2`)
                return [rows.length, hash(JSON.stringify(rows), seed)]
        }
        let digest = seed
        let count = 0
        for (let last = 0; ; ) {
                const rows = await _sql(db, part, [last, _BATCH])
                if (!rows.length) return [count, digest]
                digest = hash(JSON.stringify(rows), digest)
                count += rows.length
                last = rows[rows.length - 1][0] as number
        }
}

// 全 table の行と schema の指紋。table ごとの [行数, hash] を返す
export const content = async (db: Db) => {
        const result: Record<string, unknown> = {}
        const tables = (await _sql(db, _TABLES)) as string[][]
        for (const [name, schema] of tables) result[name] = await _table(db, name, schema)
        return result
}

export const integrity = (db: Db) => _sql(db, 'pragma integrity_check')

// 製品が載せた「view 名/連番 → 行」の map を、view 名ごとの行の配列にする (contract.md 8 節)
export const views = (flat: Record<string, unknown>) => {
        const result: Record<string, unknown[]> = {}
        for (const key of Object.keys(flat).sort()) {
                const cut = key.lastIndexOf('/')
                const rows = (result[key.slice(0, cut)] ??= [])
                rows[Number(key.slice(cut + 1))] = flat[key]
        }
        return result
}

// 製品が載せている pages の view から、page 名の一覧を得る
export const pages = (flat: Record<string, unknown>) => (views(flat).pages ?? []).map((row) => (row as string[])[0])

// その cell の装飾 (contract.md 9 節の _style)
export const styles = (db: Db, page: string, row: number, col: string) => _sql(db, _STYLES, [page, row, col])

// tables.md 5 節の孤児の検査
const _ORPHAN = (table: string, page: string) => `select count(*) from ${table} s where s."page" = ? and (
        (s."row" > 0 and s."row" not in (select "_id" from ${quote(page)}))
        or s."col" not in (select "name" from pragma_table_info(?)))`

const _LOST = (table: string) => `select count(*) from ${table} s
        where s."page" not in (select "name" from "sqlite_master" where "type" = 'table')`

const _LONG = (page: string, col: string) => `select count(*) from "_mark" m join ${quote(page)} p on p."_id" = m."row"
        where m."page" = ? and m."col" = ? and m."stop" > length(coalesce(p.${quote(col)}, ''))`

const _count = (rows: Promise<Rows>) => rows.then(([[count]]) => count as number)

// 孤児の数と、本文より長い文字区間の数。names は製品が載せている page 名の一覧
export const orphans = async (db: Db, names: string[]) => {
        let orphan = 0
        let long = 0
        for (const table of ['"_style"', '"_mark"']) {
                orphan += await _count(_sql(db, _LOST(table)))
                for (const page of names) orphan += await _count(_sql(db, _ORPHAN(table, page), [page, page]))
        }
        for (const [page, col] of (await _sql(db, 'select distinct "page", "col" from "_mark"')) as string[][]) {
                long += await _count(_sql(db, _LONG(page, col), [page, col])).catch(() => 0)
        }
        return { orphan, long }
}

