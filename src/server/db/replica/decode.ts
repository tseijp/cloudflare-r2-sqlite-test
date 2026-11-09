import { CRC_SIZE, FRAME_HEADER_SIZE, HEADER_SIZE, INDEX_SIZE_FIELD, MAGIC, PAGE_HEADER_SIZE, TAIL_SIZE } from './utils/const/const.ts'
import { decodeText, decodeVarint, readU32, readU64 } from './utils/bytes/bytes.ts'
import { checksumBytes } from './crc.ts'
import { decompress } from './utils/lz4/lz4.ts'
import type { Block, ObjectHeader, ObjectTail, Page, PageEntry, ParsedObject } from './utils/types/types.ts'

export const parseHeader = (b: Uint8Array): ObjectHeader | null => {
        if (decodeText(b.subarray(0, 4)) !== MAGIC) return null
        return {
                flags: readU32(b, 4),
                pageSize: readU32(b, 8),
                commit: readU32(b, 12),
                minTxid: Number(readU64(b, 16)),
                maxTxid: Number(readU64(b, 24)),
                timestamp: Number(readU64(b, 32)),
                preApply: readU64(b, 40),
                walOffset: Number(readU64(b, 48)),
                walSize: Number(readU64(b, 56)),
                walSalt1: readU32(b, 64),
                walSalt2: readU32(b, 68),
                nodeId: Number(readU64(b, 72)),
        }
}

export const parseTail = (b: Uint8Array): ObjectTail => {
        const base = b.length - TAIL_SIZE
        return {
                indexSize: Number(readU64(b, base)),
                postApply: readU64(b, base + INDEX_SIZE_FIELD),
                fileCrc: readU64(b, b.length - CRC_SIZE),
        }
}

export const parseIndex = (b: Uint8Array) => {
        const entries: PageEntry[] = []
        let pos = 0
        while (pos < b.length) {
                const pgno = decodeVarint(b, pos)
                if (pgno.value === 0) return entries
                const offset = decodeVarint(b, pgno.next)
                const size = decodeVarint(b, offset.next)
                entries.push({ pgno: pgno.value, offset: offset.value, size: size.value })
                pos = size.next
        }
        return entries
}

export const parseFrame = (b: Uint8Array, offset: number, scratch: Uint8Array): Page => {
        const pgno = readU32(b, offset)
        const size = readU32(b, offset + PAGE_HEADER_SIZE)
        const block = b.subarray(offset + FRAME_HEADER_SIZE, offset + FRAME_HEADER_SIZE + size)
        const n = decompress(block, scratch)
        return { pgno, data: scratch.slice(0, n) }
}

export const parseObject = (b: Uint8Array): ParsedObject | null => {
        const header = parseHeader(b)
        if (!header) return null
        const tail = parseTail(b)
        const blocks: Block[] = []
        let pos = HEADER_SIZE
        while (readU32(b, pos) !== 0) {
                const size = readU32(b, pos + PAGE_HEADER_SIZE)
                blocks.push({ pgno: readU32(b, pos), block: b.subarray(pos + FRAME_HEADER_SIZE, pos + FRAME_HEADER_SIZE + size) })
                pos += FRAME_HEADER_SIZE + size
        }
        const isValid = checksumBytes(b.subarray(0, b.length - CRC_SIZE)) === tail.fileCrc
        return { header, blocks, postApply: tail.postApply, isValid }
}
