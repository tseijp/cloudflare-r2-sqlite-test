import { SQLITE_CANTOPEN, SQLITE_IOERR, SQLITE_IOERR_SHORT_READ, SQLITE_NOTFOUND, SQLITE_OK, SQLITE_OPEN_MAIN_DB } from 'wa-sqlite'
import { CHUNK, PAGE, ROOM } from '@db/server-share'
import type { Delta } from '@db/server-share'

const _ZERO = new Uint8Array(PAGE)

export const createPager = (load: (index: number) => Promise<Uint8Array>) => {
        const _chunks = new Map<number, Uint8Array>()
        const _pages = new Map<number, Uint8Array>()
        const _dirty = new Set<number>()
        let _count = 0
        let _kept = 0
        const _cut = (count: number) => {
                _count = count
                _kept = Math.min(_kept, count)
                for (const pgno of _pages.keys()) if (pgno > count) (_pages.delete(pgno), _dirty.delete(pgno))
        }
        const _find = (pgno: number) => {
                const index = Math.floor((pgno - 1) / CHUNK)
                const chunk = _chunks.get(index)
                const at = ((pgno - 1) % CHUNK) * PAGE
                if (_pages.has(pgno)) return _pages.get(pgno)!
                if (pgno > _kept) return _ZERO
                if (!chunk) return null
                _chunks.delete(index)
                _chunks.set(index, chunk)
                return chunk.subarray(at, at + PAGE)
        }
        const _fetch = async (pgno: number) => {
                const index = Math.floor((pgno - 1) / CHUNK)
                _chunks.set(index, await load(index))
                if (_chunks.size > ROOM) _chunks.delete(_chunks.keys().next().value!)
        }
        const vfs: any = {
                name: 'pager',
                xOpen: (_name: string, _file: number, flags: number, out: DataView) => {
                        if (!(flags & SQLITE_OPEN_MAIN_DB)) return SQLITE_CANTOPEN
                        out.setInt32(0, flags, true)
                        return SQLITE_OK
                },
                xRead: (_file: number, data: Uint8Array, offset: number) => {
                        const pgno = Math.floor(offset / PAGE) + 1
                        const copy = () => (data.set(_find(pgno)!.subarray(offset % PAGE, (offset % PAGE) + data.length)), SQLITE_OK)
                        if (pgno > _count) return (data.fill(0), SQLITE_IOERR_SHORT_READ)
                        if (_find(pgno)) return copy()
                        return vfs.handleAsync(() => _fetch(pgno).then(copy, () => SQLITE_IOERR))
                },
                xWrite: (_file: number, data: Uint8Array, offset: number) => {
                        const pgno = offset / PAGE + 1
                        _pages.set(pgno, data.slice())
                        _dirty.add(pgno)
                        _count = Math.max(_count, pgno)
                        return SQLITE_OK
                },
                xTruncate: (_file: number, size: number) => (_cut(size / PAGE), SQLITE_OK),
                xFileSize: (_file: number, out: DataView) => (out.setBigInt64(0, BigInt(_count * PAGE), true), SQLITE_OK),
                xAccess: (_name: string, _flags: number, out: DataView) => (out.setInt32(0, 0, true), SQLITE_OK),
                xCheckReservedLock: (_file: number, out: DataView) => (out.setInt32(0, 0, true), SQLITE_OK),
                xFileControl: () => SQLITE_NOTFOUND,
                xSectorSize: () => PAGE,
                xDeviceCharacteristics: () => 0,
                xClose: () => SQLITE_OK,
                xSync: () => SQLITE_OK,
                xLock: () => SQLITE_OK,
                xUnlock: () => SQLITE_OK,
                xDelete: () => SQLITE_OK,
        }
        return {
                vfs,
                reset(head: Uint8Array | null, base: number, deltas: Delta[]) {
                        _chunks.clear()
                        _pages.clear()
                        _dirty.clear()
                        _count = _kept = base
                        if (head) _chunks.set(0, head)
                        for (const { commit, pages } of deltas) {
                                for (const [pgno, bytes] of pages) _pages.set(pgno, bytes)
                                _cut(commit)
                        }
                },
                compose(index: number, base: Uint8Array | null) {
                        const from = base ?? _chunks.get(index)
                        const size = Math.min(CHUNK, _count - index * CHUNK)
                        const out = new Uint8Array(size * PAGE)
                        for (let slot = 0; slot < size; slot++) {
                                const pgno = index * CHUNK + slot + 1
                                const page = _pages.get(pgno) ?? (pgno <= _kept ? from?.subarray(slot * PAGE, (slot + 1) * PAGE) : null)
                                if (page) out.set(page, slot * PAGE)
                        }
                        if (index === 0 || _chunks.has(index)) _chunks.set(index, out)
                        return out
                },
                dirty: () => [..._dirty].sort((a, b) => a - b).map((pgno): [number, Uint8Array] => [pgno, _pages.get(pgno)!]),
                clean: () => _dirty.clear(),
                rebase() {
                        _pages.clear()
                        _dirty.clear()
                        _kept = _count
                },
                stat: () => ({ pages: _count, dirty: _dirty.size }),
        }
}
