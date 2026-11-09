import { encodeText, encodeVarint, writeU16, writeU32, writeU64 } from './utils/bytes/bytes.ts'
import { CRC_SIZE, FRAME_HEADER_SIZE, HEADER_SIZE, INDEX_SIZE_FIELD, MAGIC, PAGE_FLAG_SIZE, PAGE_HEADER_SIZE, TAIL_SIZE } from './utils/share/const.ts'
import { checksumBytes } from './crc.ts'
import type { Block, ObjectHeader } from './utils/share/types.ts'

const writeHeader = (b: Uint8Array, h: ObjectHeader) => {
        b.set(encodeText(MAGIC), 0)
        writeU32(b, 4, h.flags)
        writeU32(b, 8, h.pageSize)
        writeU32(b, 12, h.commit)
        writeU64(b, 16, BigInt(h.minTxid))
        writeU64(b, 24, BigInt(h.maxTxid))
        writeU64(b, 32, BigInt(h.timestamp))
        writeU64(b, 40, h.preApply)
        writeU64(b, 48, BigInt(h.walOffset))
        writeU64(b, 56, BigInt(h.walSize))
        writeU32(b, 64, h.walSalt1)
        writeU32(b, 68, h.walSalt2)
        writeU64(b, 72, BigInt(h.nodeId))
}

const encodeIndex = (blocks: Block[]) => {
        const index: number[] = []
        let offset = HEADER_SIZE
        for (const { pgno, block } of blocks) {
                const size = FRAME_HEADER_SIZE + block.length
                index.push(...encodeVarint(pgno), ...encodeVarint(offset), ...encodeVarint(size))
                offset += size
        }
        index.push(0)
        return { index, end: offset }
}

const writeBlocks = (b: Uint8Array, blocks: Block[]) => {
        let pos = HEADER_SIZE
        for (const { pgno, block } of blocks) {
                writeU32(b, pos, pgno)
                writeU16(b, pos + 4, PAGE_FLAG_SIZE)
                writeU32(b, pos + PAGE_HEADER_SIZE, block.length)
                b.set(block, pos + FRAME_HEADER_SIZE)
                pos += FRAME_HEADER_SIZE + block.length
        }
}

export const encodeObject = (header: ObjectHeader, blocks: Block[], postApply: bigint) => {
        const { index, end } = encodeIndex(blocks)
        const indexStart = end + PAGE_HEADER_SIZE
        const tailStart = indexStart + index.length
        const out = new Uint8Array(tailStart + TAIL_SIZE)
        writeHeader(out, header)
        writeBlocks(out, blocks)
        out.set(index, indexStart)
        writeU64(out, tailStart, BigInt(index.length))
        writeU64(out, tailStart + INDEX_SIZE_FIELD, postApply)
        writeU64(out, out.length - CRC_SIZE, checksumBytes(out.subarray(0, out.length - CRC_SIZE)))
        return out
}
