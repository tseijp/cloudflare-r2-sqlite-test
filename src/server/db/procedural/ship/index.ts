import type { Pack, Slot } from '../share/types'

const _MAGIC = 0x47524431

const _KEY = /^([0-9a-f]{12})\.(full|diff)$/

export const FOOTER = 16

export const keyOf = (prefix: string, txid: number, isFull: boolean) => `${prefix}${txid.toString(16).padStart(12, '0')}.${isFull ? 'full' : 'diff'}`

export const parseKey = (prefix: string, key: string, size: number): Pack | null => {
        const m = key.startsWith(prefix) ? key.slice(prefix.length).match(_KEY) : null
        if (!m) return null
        return { key, size, txid: parseInt(m[1], 16), isFull: m[2] === 'full' }
}

export const chainOf = (packs: Pack[]) => {
        const base = packs.findLastIndex((p) => p.isFull)
        return base < 0 ? [] : packs.slice(base)
}

export const encodePack = (pages: [number, Uint8Array][], pageSize: number, commit: number) => {
        const n = pages.length
        const out = new Uint8Array(n * (pageSize + 4) + FOOTER)
        const view = new DataView(out.buffer)
        pages.forEach(([pgno, data], i) => {
                out.set(data, i * pageSize)
                view.setUint32(n * pageSize + i * 4, pgno)
        })
        view.setUint32(out.length - 16, n)
        view.setUint32(out.length - 12, pageSize)
        view.setUint32(out.length - 8, commit)
        view.setUint32(out.length - 4, _MAGIC)
        return out
}

export const imagePages = (bytes: Uint8Array, pageSize: number) => Array.from({ length: bytes.length / pageSize }, (_, i): [number, Uint8Array] => [i + 1, bytes.subarray(i * pageSize, (i + 1) * pageSize)])

export const tailOf = (size: number, pageSize: number) => Math.min(size, FOOTER + Math.ceil((size - FOOTER) / (pageSize + 4)) * 4)

export const decodeFooter = (tail: Uint8Array) => {
        const view = new DataView(tail.buffer, tail.byteOffset, tail.length)
        const count = view.getUint32(tail.length - 16)
        return { count, pageSize: view.getUint32(tail.length - 12), commit: view.getUint32(tail.length - 8), need: count * 4 + FOOTER, isPack: view.getUint32(tail.length - 4) === _MAGIC }
}

export const decodeIndex = (tail: Uint8Array, count: number) => {
        const view = new DataView(tail.buffer, tail.byteOffset, tail.length)
        const base = tail.length - FOOTER - count * 4
        return Array.from({ length: count }, (_, i) => view.getUint32(base + i * 4))
}

export const aheadOf = (pgnos: number[], slots: Map<number, Slot>, has: (pgno: number) => boolean, pageSize: number, ahead: number) => {
        const wanted = new Set<number>()
        for (const pgno of pgnos) for (let next = pgno, n = 0; n < ahead && _isNext(slots, next, pgno, pageSize) && !has(next); next++, n++) wanted.add(next)
        for (const pgno of pgnos) wanted.add(pgno)
        return [...wanted]
}

const _isNext = (slots: Map<number, Slot>, next: number, pgno: number, pageSize: number) => {
        const head = slots.get(pgno)
        const slot = slots.get(next)
        return !!head && !!slot && slot.key === head.key && slot.offset === head.offset + (next - pgno) * pageSize
}

export const coalesce = (pgnos: number[], slots: Map<number, Slot>, pageSize: number) => {
        const runs: { key: string; offset: number; length: number; pgnos: number[] }[] = []
        const sorted = pgnos.filter((pgno) => slots.has(pgno)).sort((a, b) => _compare(slots.get(a)!, slots.get(b)!))
        for (const pgno of sorted) {
                const slot = slots.get(pgno)!
                const last = runs.at(-1)
                const isJoined = !!last && last.key === slot.key && last.offset + last.length === slot.offset
                if (isJoined) last.pgnos.push(pgno)
                if (isJoined) last.length += pageSize
                if (!isJoined) runs.push({ key: slot.key, offset: slot.offset, length: pageSize, pgnos: [pgno] })
        }
        return runs
}

const _compare = (a: Slot, b: Slot) => (a.key === b.key ? a.offset - b.offset : a.key < b.key ? -1 : 1)
