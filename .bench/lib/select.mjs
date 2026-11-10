import { readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { readCsv } from './csv.mjs'

const _RANK = { 小: 0, 中: 1, 大: 2 }

export const CONTENTS = ['細長 numeric', '幅広 numeric', '短文 categorical', '長文']

const _order = (a, b) => _RANK[b.class.scale] - _RANK[a.class.scale] || b.rows - a.rows || b.bytes - a.bytes

const _pick = (xs) => [...xs].sort(_order)[0]

export const selectTargets = (list) => {
        const pool = list.filter((x) => !x.excluded)
        const roles = CONTENTS.map((c) => ({ role: c, fixture: _pick(pool.filter((x) => x.class.content === c)) }))
        return {
                targets: roles.filter((r) => r.fixture).map((r) => ({ role: r.role, ...r.fixture })),
                missing: roles.filter((r) => !r.fixture).map((r) => r.role),
        }
}

export const readFixture = (root, file) => {
        const rows = []
        readCsv(readFileSync(join(root, file)), (row) => rows.push(row))
        return [{ name: basename(file, extname(file)), rows }]
}

export const headOf = (sheets) =>
        sheets.map((s) => ({ name: s.name, rows: s.rows.slice(0, Math.ceil(s.rows.length / 10)) }))

export const csvBytesOf = (sheets) => {
        let sum = 0
        const _row = (row) => row.reduce((a, v) => a + Buffer.byteLength(v), 0) + row.length
        for (const s of sheets) for (const row of s.rows) sum += _row(row)
        return sum
}

export const recordsOf = (sheets) => sheets.reduce((a, s) => a + s.rows.length, 0)
