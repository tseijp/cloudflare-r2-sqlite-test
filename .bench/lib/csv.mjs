import { Buffer } from 'node:buffer'

const QUOTE = 34
const COMMA = 44
const CR = 13
const LF = 10
const SAMPLE = 5000
const INT = /^-?\d{1,18}$/
const NUM = /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/

const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

const readQuoted = (text, start) => {
        let i = start + 1
        let value = ''
        while (i < text.length) {
                const q = text.indexOf('"', i)
                if (q < 0) return { value: value + text.slice(i), next: text.length }
                value += text.slice(i, q)
                const isEscaped = text.charCodeAt(q + 1) === QUOTE
                if (!isEscaped) return { value, next: q + 1 }
                value += '"'
                i = q + 2
        }
        return { value, next: i }
}

const readPlain = (text, start) => {
        let i = start
        while (i < text.length) {
                const c = text.charCodeAt(i)
                const isEnd = c === COMMA || c === LF || c === CR
                if (isEnd) break
                i++
        }
        return { value: text.slice(start, i), next: i }
}

const skipToDelimiter = (text, i) => {
        while (i < text.length) {
                const c = text.charCodeAt(i)
                const isEnd = c === COMMA || c === LF || c === CR
                if (isEnd) return i
                i++
        }
        return i
}

const skipNewline = (text, i) => {
        if (text.charCodeAt(i) === CR) i++
        if (text.charCodeAt(i) === LF) i++
        return i
}

export const parseCsv = (buffer) => {
        const text = stripBom(buffer.toString('utf8'))
        const rows = []
        let row = []
        let i = 0
        while (i < text.length) {
                const isQuoted = text.charCodeAt(i) === QUOTE
                const field = isQuoted ? readQuoted(text, i) : readPlain(text, i)
                row.push(field.value)
                i = skipToDelimiter(text, field.next)
                const isComma = text.charCodeAt(i) === COMMA
                if (isComma) {
                        i++
                        if (i >= text.length) row.push('')
                        continue
                }
                const isBlank = row.length === 1 && row[0] === ''
                if (!isBlank) rows.push(row)
                row = []
                i = skipNewline(text, i)
        }
        return rows
}

const quoteCell = (v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

export const csvBytesOf = (rows) => {
        let total = 0
        for (const row of rows) total += Buffer.byteLength(row.map(quoteCell).join(',')) + 1
        return total
}

const isNumeric = (v) => NUM.test(v)

const uniqueNames = (raw) => {
        const seen = new Map()
        return raw.map((name, i) => {
                const base = name === '' ? `列${i + 1}` : name
                const n = (seen.get(base) ?? 0) + 1
                seen.set(base, n)
                return n === 1 ? base : `${base} (${n})`
        })
}

const inferType = (rows, col) => {
        let isInt = true
        let isNum = true
        let seen = 0
        for (const row of rows) {
                if (seen >= SAMPLE) break
                const v = row[col] ?? ''
                if (v === '') continue
                seen++
                if (isInt && !INT.test(v)) isInt = false
                if (isNum && !NUM.test(v)) isNum = false
                if (!isNum) return 'text'
        }
        if (seen === 0) return 'text'
        return isInt ? 'int' : 'number'
}

const convert = (type, v) => {
        if (v === '' || v == null) return null
        if (type === 'text') return v
        if (!NUM.test(v)) return v
        return Number(v)
}

export const toPage = (name, raw) => {
        const first = raw[0] ?? []
        const isHeader = first.length > 0 && first.every((v) => !isNumeric(v))
        const body = isHeader ? raw.slice(1) : raw
        const width = Math.max(first.length, ...body.slice(0, SAMPLE).map((r) => r.length))
        const names = uniqueNames(isHeader ? first : Array.from({ length: width }, () => ''))
        const types = names.map((_, i) => inferType(body, i))
        const columns = names.map((n, i) => ({ name: n, type: types[i] }))
        let maxCell = 0
        for (const row of body) {
                for (const v of row) {
                        if (v.length * 3 < maxCell) continue
                        const b = Buffer.byteLength(v)
                        if (b > maxCell) maxCell = b
                }
        }
        const rows = body.map((r) => names.map((_, i) => convert(types[i], r[i])))
        return { name, columns, rows, max_cell: maxCell, csv_bytes: csvBytesOf(raw), is_header: isHeader }
}
