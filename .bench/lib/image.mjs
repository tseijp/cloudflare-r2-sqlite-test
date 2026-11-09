import { createHash } from 'node:crypto'

const _u16 = (b, i) => (b[i] << 8) | b[i + 1]

const _u32 = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]

const _varint = (b, i) => {
        let v = 0
        for (let k = 0; k < 8; k++) {
                const x = b[i + k]
                v = v * 128 + (x & 0x7f)
                if (x < 0x80) return [v, k + 1]
        }
        return [v * 256 + b[i + 8], 9]
}

export const headerOf = (img) => {
        const raw = _u16(img, 16)
        const pageSize = raw === 1 ? 65536 : raw
        const reserved = img[20]
        const magic = String.fromCharCode(...img.subarray(0, 15))
        return { pageSize, reserved, usable: pageSize - reserved, pages: img.byteLength / pageSize, magic }
}

const _page = (img, h, pgno) => {
        const base = (pgno - 1) * h.pageSize
        const at = base + (pgno === 1 ? 100 : 0)
        const type = img[at]
        const isLeaf = type === 0x0d || type === 0x0a
        const count = _u16(img, at + 3)
        const ptrs = at + (isLeaf ? 8 : 12)
        const cells = Array.from({ length: count }, (_, k) => base + _u16(img, ptrs + k * 2))
        return { type, isLeaf, cells, right: isLeaf ? 0 : _u32(img, at + 8) }
}

const _payload = (img, h, cell) => {
        const [size, n1] = _varint(img, cell)
        const [, n2] = _varint(img, cell + n1)
        const start = cell + n1 + n2
        const u = h.usable
        const x = u - 35
        if (size <= x) return img.subarray(start, start + size)
        const m = Math.floor(((u - 12) * 32) / 255) - 23
        const k = m + ((size - m) % (u - 4))
        const local = k <= x ? k : m
        const parts = [img.subarray(start, start + local)]
        let next = _u32(img, start + local)
        let left = size - local
        while (next && left > 0) {
                const base = (next - 1) * h.pageSize
                const take = Math.min(left, u - 4)
                parts.push(img.subarray(base + 4, base + 4 + take))
                left -= take
                next = _u32(img, base)
        }
        return Buffer.concat(parts)
}

const _record = (p) => {
        const [headLen, n] = _varint(p, 0)
        const types = []
        for (let i = n; i < headLen; ) {
                const [t, m] = _varint(p, i)
                types.push(t)
                i += m
        }
        let at = headLen
        const sizes = [0, 1, 2, 3, 4, 6, 8, 8, 0, 0]
        return types.map((t) => {
                const len = t >= 12 ? Math.floor((t - 12) / 2) : sizes[t]
                const raw = p.subarray(at, at + len)
                at += len
                if (t >= 13 && t % 2) return Buffer.from(raw).toString('utf8')
                if (t === 8 || t === 9) return t - 8
                if (t >= 1 && t <= 6) return raw.reduce((v, x) => v * 256 + x, 0)
                return null
        })
}

const _walk = (img, h, root, onLeaf, depth = 1) => {
        const page = _page(img, h, root)
        if (page.isLeaf) return onLeaf(page, root, depth)
        for (const cell of page.cells) _walk(img, h, _u32(img, cell), onLeaf, depth + 1)
        if (page.right) _walk(img, h, page.right, onLeaf, depth + 1)
}

export const tablesOf = (img) => {
        const h = headerOf(img)
        const out = []
        _walk(img, h, 1, (page) => {
                for (const cell of page.cells) {
                        const [type, name, table, rootpage] = _record(_payload(img, h, cell))
                        out.push({ type, name, table, rootpage })
                }
        })
        return out
}

export const treeOf = (img, root) => {
        const h = headerOf(img)
        const s = { leaves: 0, cells: 0, depth: 0 }
        _walk(img, h, root, (page, pgno, depth) => {
                s.leaves++
                s.cells += page.cells.length
                s.depth = Math.max(s.depth, depth)
        })
        s.f = s.cells / Math.max(1, s.leaves)
        return s
}

export const pageHashes = (img) => {
        const { pageSize, pages } = headerOf(img)
        const _hash = (k) => createHash('sha256').update(img.subarray(k * pageSize, (k + 1) * pageSize)).digest('hex')
        return Array.from({ length: pages }, (_, k) => _hash(k).slice(0, 16))
}

export const walkPages = (img, root, onPage) => {
        const h = headerOf(img)
        const _visit = (pgno) => {
                onPage(pgno)
                const page = _page(img, h, pgno)
                if (page.isLeaf) return
                for (const cell of page.cells) _visit(_u32(img, cell))
                if (page.right) _visit(page.right)
        }
        _visit(root)
}
