import { quote } from '@test/server-share'
import type { Code } from '@test/server-share'

// 製品の logical な命令 (contract.md 5 節) のうち、検証が field を読むもの
export interface Op {
        type: string
        id?: string
        page?: string
        col?: string
        name?: string
        text?: string | null
        value?: string | null
        size?: number
        marks?: unknown[][]
        names?: string[]
        rows?: (string | null)[][]
}

const _LEAK = 8

const _SAMPLE = 20

const _isText = (value: unknown): value is string | null => typeof value === 'string' || value === null

const _isLong = (value: unknown): value is string => typeof value === 'string' && value.length >= _LEAK

// 名前と本文。到達した文字の種類を数えるために使う
export const texts = (op: Op) => {
        const fields = [op.page, op.col, op.name, op.text, op.value]
        return [...fields, ...(op.names ?? []), ...(op.rows?.[0] ?? [])].filter(_isText)
}

// 利用者が渡した本文と値のうち、SQL の文に現れてはならないもの。
// sql の命令の文と、文の語と区別できない短い値は除く
export const values = (op: Op) => {
        const cells = (op.rows ?? []).slice(0, _SAMPLE).flat()
        const marks = (op.marks ?? []).map((mark) => mark[3])
        if (op.type === 'sql') return []
        return [...new Set([op.text, op.value, ...marks, ...cells].filter(_isLong))].slice(0, _SAMPLE)
}

// 1 行に出す命令の要約
export const title = (op: Op) => {
        const { type, ...rest } = op
        const text = JSON.stringify(rest)
        return `${type} ${text.length > 96 ? `${text.slice(0, 96)}…` : text}`
}

// 行をまとめて足す SQL。本文は行ごとに違う 8 文字の語の繰り返しで、size 文字ほどになる
const _FILL = (page: string, col: string) => `insert into ${quote(page)} (${quote(col)})
        with recursive c(n) as (select 1 union all select n + 1 from c where n < ?)
        select printf('r%d ', n) || replace(hex(zeroblob(?)), '00', printf('%08x', (n * 2654435761) % 4294967296))
        from c`

export const fill = (page: string, col: string, rows: number, size: number): Code => [
        'sql',
        _FILL(page, col),
        [rows, Math.ceil(size / 8)],
]
