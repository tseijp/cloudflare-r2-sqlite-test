import { gunzipSync } from 'node:zlib'

export const [PAGE, CHUNK, LIMIT, SWAP, SLOTS, ROWS] = [4096, 512, 8192, 2048, 8, 100] // contract 10 節
const _view = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength)
const _magic = (b) => String.fromCharCode(...b.subarray(0, 4))
const _safe = (f) => { try { return f() } catch { return null } } // 壊れた object は null (復号できない) として判定に回す

// contract 4 節の image。chunk の長さの表から各 chunk の位置を出し、full なら伸長して繋ぐ
export const decodeImage = (bytes, full) => {
        if (!bytes || bytes.length < 12 || _magic(bytes) !== 'SQLI') return null
        const v = _view(bytes)
        const [pages, n, chunks] = [v.getUint32(4), v.getUint32(8), []]
        let offset = 12 + 4 * n
        for (let i = 0; i < n; i++) (chunks.push([offset, v.getUint32(12 + 4 * i)]), (offset += v.getUint32(12 + 4 * i)))
        const file = full ? Buffer.concat(chunks.map(([o, l]) => gunzipSync(bytes.subarray(o, o + l)))) : null
        return { pages, chunks, file, ok: n === Math.ceil(pages / CHUNK) && offset === bytes.length && (!full || file.length === pages * PAGE) }
}

// contract 4 節の delta。gzip を伸長し、(pgno, page) の組を count 個読む
export const decodeDelta = (bytes) => {
        const raw = _safe(() => gunzipSync(bytes))
        if (!raw || raw.length < 16 || _magic(raw) !== 'SQLD') return null
        const v = _view(raw)
        const [commit, count, tagLen, pairs] = [v.getUint32(4), v.getUint32(8), v.getUint32(12), []]
        let at = 16 + tagLen
        for (let i = 0; i < count; i++, at += 4 + PAGE) pairs.push([v.getUint32(at), raw.subarray(at + 4, at + 4 + PAGE)])
        return { commit, count, tag: Buffer.from(raw.subarray(16, 16 + tagLen)).toString('utf8'), pairs, ok: at === raw.length }
}

const _resize = (file, length) => Buffer.concat([file.subarray(0, length), Buffer.alloc(Math.max(0, length - file.length))])

// store の object から、鎖に繋がる delta だけを順に当てた database file と、stat と比べる値を出す
export const decodeStore = (objects, full = false) => {
        const image = objects.get(0)
        const img = image && _safe(() => decodeImage(image.bytes, full))
        const out = { base: img?.pages ?? 0, pages: img?.pages ?? 0, deltas: 0, patch: 0, chunks: img?.chunks ?? [], file: img?.file ?? null, tag: image?.tag ?? '', ok: !image || !!img?.ok }
        let tag = image?.tag ?? ''
        for (let seq = 1; img && objects.has(seq); seq++) {
                const d = _safe(() => decodeDelta(objects.get(seq).bytes))
                if (!d || d.tag !== tag) break
                if (full) out.file = _resize(out.file, d.commit * PAGE)
                for (const [pgno, page] of full ? d.pairs : []) out.file.set(page, (pgno - 1) * PAGE)
                ;(out.deltas++, (out.patch += d.count), (out.pages = d.commit), (out.ok &&= d.ok), (tag = objects.get(seq).tag))
        }
        out.garbage = [...objects.keys()].filter((k) => k > out.deltas || (k === 0 && !img)).sort((a, b) => a - b)
        return out
}
