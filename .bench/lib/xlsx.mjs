import { inflateRawSync } from 'node:zlib'

const EOCD = 0x06054b50
const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

const decodeXml = (s) =>
        s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, code) => {
                if (code[0] !== '#') return ENTITIES[code] ?? m
                const n = code[1] === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
                return String.fromCodePoint(n)
        })

const readEntries = (buffer) => {
        let e = buffer.length - 22
        while (e > 0 && buffer.readUInt32LE(e) !== EOCD) e--
        const count = buffer.readUInt16LE(e + 10)
        const entries = new Map()
        let o = buffer.readUInt32LE(e + 16)
        for (let i = 0; i < count; i++) {
                const method = buffer.readUInt16LE(o + 10)
                const comp = buffer.readUInt32LE(o + 20)
                const nameLen = buffer.readUInt16LE(o + 28)
                const extraLen = buffer.readUInt16LE(o + 30)
                const commentLen = buffer.readUInt16LE(o + 32)
                const offset = buffer.readUInt32LE(o + 42)
                const name = buffer.toString('utf8', o + 46, o + 46 + nameLen)
                entries.set(name, { method, comp, offset })
                o += 46 + nameLen + extraLen + commentLen
        }
        return entries
}

const readEntry = (buffer, entry) => {
        const nameLen = buffer.readUInt16LE(entry.offset + 26)
        const extraLen = buffer.readUInt16LE(entry.offset + 28)
        const start = entry.offset + 30 + nameLen + extraLen
        const data = buffer.subarray(start, start + entry.comp)
        if (entry.method === 0) return data.toString('utf8')
        return inflateRawSync(data).toString('utf8')
}

const parseShared = (xml) =>
        [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
                [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => decodeXml(t[1])).join(''),
        )

const parseSheets = (workbook, rels) => {
        const targets = new Map()
        for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
                const id = m[0].match(/\bId="([^"]*)"/)?.[1]
                const target = m[0].match(/\bTarget="([^"]*)"/)?.[1]
                if (id && target) targets.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'))
        }
        return [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
                name: decodeXml(m[0].match(/\bname="([^"]*)"/)?.[1] ?? ''),
                target: targets.get(m[0].match(/\br:id="([^"]*)"/)?.[1]) ?? '',
        }))
}

const colIndex = (letters) => {
        let n = 0
        for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
        return n - 1
}

const cellValue = (attrs, inner, shared) => {
        const type = attrs.match(/\bt="([^"]*)"/)?.[1] ?? 'n'
        if (type === 'inlineStr') return decodeXml(inner.match(/<t[^>]*>([^<]*)<\/t>/)?.[1] ?? '')
        const v = inner.match(/<v>([^<]*)<\/v>/)?.[1]
        if (v == null) return ''
        if (type === 's') return shared[Number(v)] ?? ''
        return decodeXml(v)
}

const parseSheet = (xml, shared) => {
        const rows = []
        for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
                const row = []
                for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
                        const idx = colIndex(c[1])
                        while (row.length < idx) row.push('')
                        row.push(cellValue(c[2], c[3] ?? '', shared))
                }
                rows.push(row)
        }
        return rows
}

export const parseXlsx = (buffer) => {
        const entries = readEntries(buffer)
        const text = (name) => (entries.has(name) ? readEntry(buffer, entries.get(name)) : '')
        const shared = parseShared(text('xl/sharedStrings.xml'))
        const sheets = parseSheets(text('xl/workbook.xml'), text('xl/_rels/workbook.xml.rels'))
        return sheets.map((s) => ({ name: s.name, rows: parseSheet(text(s.target), shared) }))
}
