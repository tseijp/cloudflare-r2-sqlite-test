import { readU16, readU32 } from './utils/bytes/bytes'
import { DB_CHANGE_COUNTER_OFFSET, DB_PAGE_COUNT_OFFSET, DB_PAGE_SIZE_OFFSET, DB_VERSION_VALID_OFFSET, MAX_PAGE_SIZE } from './utils/share/const'
import { lockPgno } from './crc'
import { compress } from './utils/lz4/lz4'
import type { Frame } from '../utils/share/types'
import type { Page } from './utils/share/types'

const _readPageSize = (image: Uint8Array) => {
        const raw = readU16(image, DB_PAGE_SIZE_OFFSET)
        if (raw === 1) return MAX_PAGE_SIZE
        return raw
}

export const readCommit = (image: Uint8Array, pageSize: number) => {
        const isValid = readU32(image, DB_CHANGE_COUNTER_OFFSET) === readU32(image, DB_VERSION_VALID_OFFSET)
        if (isValid) return readU32(image, DB_PAGE_COUNT_OFFSET)
        return Math.floor(image.length / pageSize)
}

export const splitImage = (image: Uint8Array) => {
        const pageSize = _readPageSize(image)
        const commit = Math.floor(image.length / pageSize)
        const lock = lockPgno(pageSize)
        const pages: Page[] = []
        for (let pgno = 1; pgno <= commit; pgno++) {
                if (pgno === lock) continue
                pages.push({ pgno, data: image.subarray((pgno - 1) * pageSize, pgno * pageSize) })
        }
        return { pageSize, commit, pages }
}

export const latestPages = (frames: Frame[]) => {
        const pageSize = frames[0].data.length
        const lock = lockPgno(pageSize)
        const commit = frames.reduce((n, f) => f.commit || n, 0)
        const latest = new Map<number, Frame>()
        for (const frame of frames) latest.set(frame.pgno, frame)
        const pages: Page[] = []
        for (const { pgno, data } of latest.values()) {
                const isOut = pgno === lock || (commit > 0 && pgno > commit)
                if (isOut) continue
                pages.push({ pgno, data })
        }
        return { pageSize, commit, pages: pages.sort((a, b) => a.pgno - b.pgno) }
}

export const compressPages = (pages: Page[]) => pages.map(({ pgno, data }) => ({ pgno, block: compress(data) }))
