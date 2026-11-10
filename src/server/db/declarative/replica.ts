import { aheadOf, chainOf, coalesce, decodeFooter, decodeIndex, encodePack, imagePages, keyOf, parseKey, tailOf } from '../procedural/ship/index'
import type { Dirty, Pack, Slot, Source, Storage } from '../procedural/share/types'

interface _Config {
        prefix: string
        pageSize: number
        diffs: number
        ratio: number
}

interface _Source {
        take(): Dirty
        image(): Promise<Uint8Array>
}

export const createReplica = (storage: Storage, config: _Config) => {
        let _packs: Pack[] = []
        let _txid = 0
        let _isStale = false
        let _tail: Promise<unknown> = Promise.resolve()
        const _index = async (pack: Pack) => {
                const tail = (await storage.get(pack.key, { suffix: tailOf(pack.size, config.pageSize) }))!
                const footer = decodeFooter(tail)
                const body = footer.need <= tail.length ? tail : (await storage.get(pack.key, { suffix: footer.need }))!
                return { ...footer, pgnos: decodeIndex(body, footer.count) }
        }
        const _fetch = async (slots: Map<number, Slot>, pageSize: number, commit: number, pgnos: number[] | null, has: (pgno: number) => boolean, ahead: number) => {
                const wanted = pgnos ? aheadOf(pgnos, slots, has, pageSize, ahead) : Array.from({ length: commit }, (_, i) => i + 1).filter((pgno) => !has(pgno))
                const runs = coalesce(wanted, slots, pageSize)
                const parts = await Promise.all(runs.map((run) => storage.get(run.key, { offset: run.offset, length: run.length })))
                const found = runs.flatMap((run, i) => run.pgnos.map((pgno, j): [number, Uint8Array] => [pgno, parts[i]!.slice(j * pageSize, (j + 1) * pageSize)]))
                const absent = wanted.filter((pgno) => !slots.has(pgno)).map((pgno): [number, Uint8Array] => [pgno, new Uint8Array(pageSize)])
                return [...found, ...absent]
        }
        const _put = async (bytes: Uint8Array, isFull: boolean) => {
                const key = keyOf(config.prefix, _txid + 1, isFull)
                const put = await storage.put(key, bytes, { ifNoneMatch: true })
                if (!put) return Promise.reject(new Error(`replica: ${key} was written by another writer`))
                const stale = isFull ? _packs.map((pack) => pack.key) : []
                _txid += 1
                _packs = [...(isFull ? [] : _packs), { key, size: bytes.length, txid: _txid, isFull }]
                if (stale.length) await storage.delete(stale)
                return { key, bytes: bytes.length, isFull, txid: _txid }
        }
        const _isRollup = (dirty: Dirty) => {
                const diffs = _packs.filter((pack) => !pack.isFull)
                const sent = diffs.reduce((n, pack) => n + pack.size, dirty.pages.length * dirty.pageSize)
                const isBased = _packs.some((pack) => pack.isFull)
                return !isBased || diffs.length >= config.diffs || sent > dirty.commit * dirty.pageSize * config.ratio
        }
        const _save = async (source: _Source) => {
                const dirty = source.take()
                if (!dirty.pages.length && !_isStale) return null
                const isFull = _isStale || _isRollup(dirty)
                _isStale = true
                const bytes = isFull ? await source.image() : null
                const pack = bytes ? encodePack(imagePages(bytes, dirty.pageSize), dirty.pageSize, bytes.length / dirty.pageSize) : encodePack(dirty.pages, dirty.pageSize, dirty.commit)
                const saved = await _put(pack, isFull)
                _isStale = false
                return saved
        }
        return {
                async open(): Promise<Source | null> {
                        const listed = await storage.list(config.prefix)
                        _packs = listed.flatMap((o) => parseKey(config.prefix, o.key, o.size) ?? []).sort((a, b) => a.txid - b.txid)
                        _txid = _packs.at(-1)?.txid ?? 0
                        const chain = chainOf(_packs)
                        if (!chain.length) return null
                        const indexes = await Promise.all(chain.map(_index))
                        const slots = new Map<number, Slot>()
                        chain.forEach((pack, i) => indexes[i].pgnos.forEach((pgno, j) => slots.set(pgno, { key: pack.key, offset: j * indexes[i].pageSize })))
                        const { pageSize, commit } = indexes.at(-1)!
                        return { pageSize, commit, load: (pgnos, has, ahead) => _fetch(slots, pageSize, commit, pgnos, has, ahead) }
                },
                save(source: _Source) {
                        const out = _tail.then(() => _save(source))
                        _tail = out.catch(() => null)
                        return out
                },
                get txid() {
                        return _txid
                },
        }
}
