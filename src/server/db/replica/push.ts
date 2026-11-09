import { formatKey } from './utils/keys/keys.ts'
import { FLAG_NO_CHECKSUM, SNAPSHOT_LEVEL } from './utils/share/const.ts'
import { applySums, seedSums } from './crc.ts'
import { encodeObject } from './encode.ts'
import { loadState } from './state.ts'
import { compressPages, latestPages, splitImage } from './pages.ts'
import type { Frame } from '../utils/share/types.ts'
import type { Context, ObjectHeader, Page, Pushed } from './utils/share/types.ts'

const _createHeader = (ctx: Context, fields: Pick<ObjectHeader, 'flags' | 'pageSize' | 'commit' | 'minTxid' | 'maxTxid' | 'preApply'>): ObjectHeader => {
        const _wal = { walOffset: 0, walSize: 0, walSalt1: 0, walSalt2: 0 }
        return {
                ...fields,
                ..._wal,
                timestamp: ctx.state.now,
                nodeId: ctx.config.nodeId,
        }
}

const _writeObject = async (ctx: Context, level: number, header: ObjectHeader, pages: Page[], postApply: bigint): Promise<Pushed> => {
        const bytes = encodeObject(header, compressPages(pages), postApply)
        const key = formatKey(ctx.config.prefix, level, header.minTxid, header.maxTxid)
        const put = await ctx.storage.put(key, bytes, { ifNoneMatch: true })
        if (!put) return Promise.reject(new Error(`replica: writer conflict on ${key}`))
        return { key, bytes: bytes.length }
}

export const pushFrames = async (ctx: Context, frames: Frame[], txid: number): Promise<Pushed> => {
        const state = await loadState(ctx)
        const fresh = frames.filter((frame) => frame.txid > state.last)
        const isStale = !fresh.length || txid <= state.last
        if (isStale) return { key: '', bytes: 0 }
        const { pageSize, commit: found, pages } = latestPages(fresh)
        const commit = found || state.commit || pages[pages.length - 1].pgno
        const minTxid = state.last ? state.last + 1 : fresh.reduce((n, frame) => Math.min(n, frame.txid), txid)
        const sums = state.sums && applySums(state.sums, pages, commit)
        const flags = sums ? 0 : FLAG_NO_CHECKSUM
        const preApply = state.sums ? state.sums.total : 0n
        const header = _createHeader(ctx, { flags, pageSize, commit, minTxid, maxTxid: txid, preApply })
        const pushed = await _writeObject(ctx, 0, header, pages, sums ? sums.total : 0n)
        state.last = txid
        state.commit = commit
        state.sums = sums
        state.tops[0] = Math.max(state.tops[0], txid)
        state.born.set(pushed.key, state.now)
        return pushed
}

export const pushSnapshot = async (ctx: Context, bytes: Uint8Array, txid: number) => {
        const state = await loadState(ctx)
        if (!bytes.length) return { key: '' }
        const { pageSize, commit, pages } = splitImage(bytes)
        const sums = seedSums(pages)
        const header = _createHeader(ctx, { flags: 0, pageSize, commit, minTxid: 1, maxTxid: txid, preApply: 0n })
        const { key } = await _writeObject(ctx, SNAPSHOT_LEVEL, header, pages, sums.total)
        state.snapshotAt = state.now
        state.base = Math.max(state.base, txid)
        if (txid < state.last) return { key }
        state.last = txid
        state.commit = commit
        state.sums = sums
        return { key }
}
