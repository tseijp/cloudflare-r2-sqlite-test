import { CHECKSUM_FLAG, CRC_POLY_HI, PENDING_BYTE } from './utils/const/const.ts'
import { writeU32 } from './utils/bytes/bytes.ts'
import type { Page, Sums } from './utils/types/types.ts'

const tableHi = new Uint32Array(256)
const tableLo = new Uint32Array(256)

const fillTable = () => {
        for (let i = 0; i < 256; i++) {
                let hi = 0
                let lo = i
                for (let j = 0; j < 8; j++) {
                        const isOdd = (lo & 1) === 1
                        lo = ((lo >>> 1) | ((hi & 1) << 31)) >>> 0
                        hi = hi >>> 1
                        if (isOdd) hi = (hi ^ CRC_POLY_HI) >>> 0
                }
                tableHi[i] = hi
                tableLo[i] = lo
        }
}

fillTable()

const createHasher = () => {
        let hi = 0xffffffff
        let lo = 0xffffffff
        const update = (bytes: Uint8Array) => {
                for (let i = 0; i < bytes.length; i++) {
                        const k = (lo ^ bytes[i]) & 0xff
                        lo = (tableLo[k] ^ ((lo >>> 8) | ((hi & 0xff) << 24))) >>> 0
                        hi = (tableHi[k] ^ (hi >>> 8)) >>> 0
                }
        }
        const sum = () => (BigInt((hi ^ 0xffffffff) >>> 0) << 32n) | BigInt((lo ^ 0xffffffff) >>> 0)
        return { update, sum }
}

export const checksumBytes = (bytes: Uint8Array) => {
        const hasher = createHasher()
        hasher.update(bytes)
        return CHECKSUM_FLAG | hasher.sum()
}

export const lockPgno = (pageSize: number) => Math.floor(PENDING_BYTE / pageSize) + 1

const checksumPage = (pgno: number, data: Uint8Array) => {
        const hasher = createHasher()
        const head = new Uint8Array(4)
        writeU32(head, 0, pgno)
        hasher.update(head)
        hasher.update(data)
        return CHECKSUM_FLAG | hasher.sum()
}

export const seedSums = (pages: Page[]): Sums => {
        const sums = new Map<number, bigint>()
        let total = 0n
        for (const page of pages) {
                const sum = checksumPage(page.pgno, page.data)
                sums.set(page.pgno, sum)
                total ^= sum
        }
        return { sums, total: CHECKSUM_FLAG | total }
}

export const applySums = (base: Sums, pages: Page[], commit: number): Sums => {
        const sums = new Map(base.sums)
        let total = base.total
        for (const [pgno, sum] of sums) {
                if (pgno <= commit) continue
                total ^= sum
                sums.delete(pgno)
        }
        for (const page of pages) {
                const sum = checksumPage(page.pgno, page.data)
                total ^= (sums.get(page.pgno) ?? 0n) ^ sum
                sums.set(page.pgno, sum)
        }
        return { sums, total: CHECKSUM_FLAG | total }
}
