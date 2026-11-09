import { MAX_PAGE_SIZE, TAIL_SIZE } from './utils/share/const.ts'
import { parseFrame, parseIndex, parseTail } from './decode.ts'
import type { Storage } from '../utils/share/types.ts'
import type { ObjectIndex, Page, PageEntry } from './utils/share/types.ts'

interface Range {
        offset: number
        length: number
        entries: PageEntry[]
}

export const readIndex = async (storage: Storage, key: string): Promise<ObjectIndex> => {
        const tail = await storage.get(key, { suffix: TAIL_SIZE })
        if (!tail) return Promise.reject(new Error(`replica: missing object ${key}`))
        const parsed = parseTail(tail)
        const body = await storage.get(key, { suffix: TAIL_SIZE + parsed.indexSize })
        if (!body) return Promise.reject(new Error(`replica: missing index ${key}`))
        return { ...parsed, entries: parseIndex(body.subarray(0, parsed.indexSize)) }
}

const coalesce = (entries: PageEntry[]) => {
        const ranges: Range[] = []
        for (const entry of [...entries].sort((a, b) => a.offset - b.offset)) {
                const last = ranges[ranges.length - 1]
                const isAdjacent = last && last.offset + last.length === entry.offset
                if (isAdjacent) {
                        last.length += entry.size
                        last.entries.push(entry)
                        continue
                }
                ranges.push({ offset: entry.offset, length: entry.size, entries: [entry] })
        }
        return ranges
}

export const readPages = async (storage: Storage, key: string, entries: PageEntry[], place: (page: Page) => void) => {
        const scratch = new Uint8Array(MAX_PAGE_SIZE)
        const ranges = coalesce(entries)
        const chunks = await Promise.all(ranges.map(({ offset, length }) => storage.get(key, { offset, length })))
        for (const [i, { offset, entries }] of ranges.entries()) {
                const bytes = chunks[i]
                if (!bytes) return Promise.reject(new Error(`restore: missing range in ${key}`))
                for (const entry of entries) place(parseFrame(bytes, entry.offset - offset, scratch))
        }
}
