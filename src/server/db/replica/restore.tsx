import { seedSums } from './crc'
import { readCommit, splitImage } from './pages'
import { createPlan } from './plan'
import { readIndex, readPages } from './read'
import { loadState } from './state'
import type { Context, ObjectIndex, Page, ReplicaState } from './utils/share/types'

const _createImage = (maxPgno: number) => {
        let _pageSize = 0
        let _buf = new Uint8Array(0)
        return {
                place: (page: Page) => {
                        if (!_pageSize) {
                                _pageSize = page.data.length
                                _buf = new Uint8Array(maxPgno * _pageSize)
                        }
                        _buf.set(page.data, (page.pgno - 1) * _pageSize)
                },
                finish: () => {
                        if (!_pageSize) return _buf
                        const size = readCommit(_buf, _pageSize) * _pageSize
                        if (size === _buf.length) return _buf
                        return _buf.slice(0, size)
                },
        }
}

const _pickSources = (indexes: ObjectIndex[]) => {
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

const _seedState = (state: ReplicaState, bytes: Uint8Array, max: number, expected: bigint) => {
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
        const { needed, maxPgno } = _pickSources(indexes)
        const image = _createImage(maxPgno)
        await Promise.all(plan.map((ref, i) => readPages(ctx.storage, ref.key, needed[i], image.place)))
        const bytes = image.finish()
        if (!bytes.length) return bytes
        const last = plan[plan.length - 1]
        const isValid = _seedState(state, bytes, last.max, indexes[indexes.length - 1].postApply)
        if (!isValid) return Promise.reject(new Error(`restore: checksum mismatch at ${last.key}`))
        return bytes
}
