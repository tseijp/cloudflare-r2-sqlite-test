import type { Op } from '@db/server-share'

export const toKey = (...address: (string | number)[]) => JSON.stringify(address)

export const toCell = (text: string | null, marks: any[][]) => JSON.stringify(marks.length ? marks.map((mark) => [text, ...mark]) : [[text, null, null, null, null]])

export const toStyle = (value: string | null) => JSON.stringify(value === null ? [] : [[value]])

export const toOp = (key: string, value: string): Op => {
        const [type, page, row, col, name] = JSON.parse(key)
        const rows: any[][] = JSON.parse(value)
        const marks = rows.filter((found) => found[1] !== null).map((found) => found.slice(1))
        if (type === 'style') return { type, id: 'echo', page, row, col, name, value: rows[0]?.[0] ?? null }
        return { type, id: 'echo', page, row, col, text: rows[0]?.[0] ?? null, marks }
}
