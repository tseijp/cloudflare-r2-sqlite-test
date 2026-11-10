import { gunzipSync } from 'node:zlib'

export const PAGE = 4096
export const CHUNK = 512
export const LIMIT = 8192
export const SWAP = 2048
export const SLOTS = 8
export const ROWS = 100
const _view = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength)
const _magic = (b) => String.fromCharCode(...b.subarray(0, 4))

export const decodeImage = (bytes, full) => {
        if (!bytes || bytes.length < 12 || _magic(bytes) !== 'SQLI') return null
        const v = _view(bytes)
        const pages = v.getUint32(4)
        const n = v.getUint32(8)
        const chunks = []
        let offset = 12 + 4 * n
        for (let i = 0; i < n; i++) {
                chunks.push([offset, v.getUint32(12 + 4 * i)])
                offset += v.getUint32(12 + 4 * i)
        }
        const file = full ? Buffer.concat(chunks.map(([o, l]) => gunzipSync(bytes.subarray(o, o + l)))) : null
        const ok = n === Math.ceil(pages / CHUNK) && offset === bytes.length && (!full || file.length === pages * PAGE)
        return { pages, chunks, file, ok }
}

export const decodeDelta = (bytes) => {
        const raw = gunzipSync(bytes)
        if (_magic(raw) !== 'SQLD') return null
        const v = _view(raw)
        const [commit, count, tagLen] = [v.getUint32(4), v.getUint32(8), v.getUint32(12)]
        const tag = Buffer.from(raw.subarray(16, 16 + tagLen)).toString('utf8')
        const pairs = []
        let at = 16 + tagLen
        for (let i = 0; i < count; i++, at += 4 + PAGE) pairs.push([v.getUint32(at), raw.subarray(at + 4, at + 4 + PAGE)])
        return { commit, count, tag, pairs, ok: at === raw.length }
}

const _resize = (file, length) => {
        const out = Buffer.alloc(length)
        file.copy(out, 0, 0, Math.min(length, file.length))
        return out
}

export const decodeStore = (objects, full = false) => {
        const image = objects.get(0)
        const img = image && decodeImage(image.bytes, full)
        const out = { base: img?.pages ?? 0, pages: img?.pages ?? 0, deltas: 0, patch: 0, chunks: img?.chunks ?? [], file: img?.file ?? null, tag: image?.tag ?? '', ok: !image || !!img?.ok }
        let tag = image?.tag ?? ''
        for (let seq = 1; img && objects.has(seq); seq++) {
                const d = decodeDelta(objects.get(seq).bytes)
                if (!d || d.tag !== tag) break
                if (full) out.file = _resize(out.file, d.commit * PAGE)
                for (const [pgno, page] of full ? d.pairs : []) out.file.set(page, (pgno - 1) * PAGE)
                out.deltas++
                out.patch += d.count
                out.pages = d.commit
                out.ok &&= d.ok
                tag = objects.get(seq).tag
        }
        out.garbage = [...objects.keys()].filter((k) => k > out.deltas || (k === 0 && !img)).sort((a, b) => a - b)
        return out
}
