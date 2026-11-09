import { seedSums } from './crc.ts'
import { readCommit, splitImage } from './pages.ts'
import { createPlan } from './plan.ts'
import { readIndex, readPages } from './read.ts'
import { loadState } from './state.ts'
import type { Context, ObjectIndex, Page, ReplicaState } from './utils/share/types.ts'

const createImage = (maxPgno: number) => {
        let pageSize = 0
        let buf = new Uint8Array(0)
        const place = (page: Page) => {
                if (!pageSize) {
                        pageSize = page.data.length
                        buf = new Uint8Array(maxPgno * pageSize)
                }
                buf.set(page.data, (page.pgno - 1) * pageSize)
        }
        const finish = () => {
                if (!pageSize) return buf
                const size = readCommit(buf, pageSize) * pageSize
                if (size === buf.length) return buf
                return buf.slice(0, size)
        }
        return { place, finish }
}

const pickSources = (indexes: ObjectIndex[]) => {
        const sources = new Map<number, number>()
        let maxPgno = 0
        for (const [i, index] of indexes.entries()) {
                for (const entry of index.entries) {
                        sources.set(entry.pgno, i)
                        maxPgno = Math.max(maxPgno, entry.pgno)
                }
        }
        const needed = indexes.map((index, i) => index.entries.filter((entry) => sources.get(entry.pgno) === i))
        return { needed, maxPgno }
}

const seedState = (state: ReplicaState, bytes: Uint8Array, max: number, expected: bigint) => {
        const { pageSize, pages } = splitImage(bytes)
        const sums = seedSums(pages)
        const isMatch = expected === 0n || expected === sums.total
        if (!isMatch) return false
        if (max < state.last) return true
        state.last = max
        state.commit = bytes.length / pageSize
        state.sums = sums
        return true
}

export const restoreImage = async (ctx: Context, txid?: number) => {
        const state = await loadState(ctx)
        const plan = await createPlan(ctx, txid)
        const indexes = await Promise.all(plan.map((ref) => readIndex(ctx.storage, ref.key)))
        const { needed, maxPgno } = pickSources(indexes)
        const image = createImage(maxPgno)
        await Promise.all(plan.map((ref, i) => readPages(ctx.storage, ref.key, needed[i], image.place)))
        const bytes = image.finish()
        if (!bytes.length) return bytes
        const last = plan[plan.length - 1]
        const isValid = seedState(state, bytes, last.max, indexes[indexes.length - 1].postApply)
        if (!isValid) return Promise.reject(new Error(`restore: checksum mismatch at ${last.key}`))
        return bytes
}
