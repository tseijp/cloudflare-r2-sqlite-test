import { CHUNK, PAGE, SLOTS } from '@db/server-share'
import { decodeDelta, decodeImage, encodeDelta, encodeImage, pack, unpack } from '@db/server-executer-store-codec'
import type { Delta, Store } from '@db/server-share'

export const createStorage = (store: Store) => {
        let _tag = ''
        let _tail = ''
        let _pages = 0
        let _sizes: number[] = []
        let _deltas = 0
        let _patch = 0
        let _unsure = -1
        let _stale: number[] = []
        const _fail = (text: string) => Promise.reject(new Error(text))
        const _at = (index: number) => _sizes.slice(0, index).reduce((sum, size) => sum + size, 12 + _sizes.length * 4)
        const _reset = (tag: string, pages: number, sizes: number[]) => {
                _tag = _tail = tag
                _pages = pages
                _sizes = sizes
                _deltas = _patch = 0
                _unsure = -1
                _stale = []
        }
        const _sweep = async () => {
                if (_stale.length) await store.delete(_stale)
                _stale = []
        }
        const _put = async (seq: number, bytes: Uint8Array, tag: string) => {
                const seen = _unsure < 0 ? null : await store.get(_unsure, 0, 1)
                const isSame = _unsure < 0 || (seen?.tag ?? '') === (_unsure ? '' : _tag)
                if (!isSame) return _fail('store diverged')
                await _sweep()
                _unsure = seq
                const next = await store.put(seq, bytes, tag)
                _unsure = -1
                if (next === null) return _fail('store conflict')
                return next
        }
        const chunk = async (index: number, head?: Uint8Array): Promise<Uint8Array> => {
                const end = _at(index) + _sizes[index]
                if (head && head.length >= end) return unpack(head.subarray(_at(index), end))
                const part = await store.get(0, _at(index), _sizes[index])
                if (!part || part.tag !== _tag) return _fail('image changed')
                return unpack(part.bytes)
        }
        const chain = async (found: Delta[] = []): Promise<Delta[]> => {
                if (_sizes.length <= 1) return found
                const part = await store.get(_deltas + 1)
                const delta = part ? await decodeDelta(part.bytes) : null
                const isNext = delta?.prev === _tail
                if (part && !delta) return _fail('delta corrupt')
                if (part && !isNext) await store.delete(Array.from({ length: SLOTS - _deltas }, (_, index) => _deltas + 1 + index))
                if (!part || !delta || !isNext) return found
                _deltas += 1
                _tail = part.tag
                _patch += delta.pages.length
                return chain([...found, delta])
        }
        return {
                chunk,
                chain,
                async head() {
                        const part = await store.get(0, 0, CHUNK * PAGE)
                        const image = part ? decodeImage(part.bytes) : { pages: 0, sizes: [] }
                        if (!image) return _fail('image corrupt')
                        _reset(part?.tag ?? '', image.pages, image.sizes)
                        return part ? chunk(0, part.bytes) : null
                },
                async push(commit: number, pages: Delta['pages']) {
                        _tail = await _put(_deltas + 1, await encodeDelta({ prev: _tail, commit, pages }), '')
                        _deltas += 1
                        _patch += pages.length
                },
                async merge(pages: number, compose: (index: number, base: Uint8Array | null) => Uint8Array) {
                        const old = _sizes.length > 1 ? await store.get(0) : null
                        const stale = Array.from({ length: _deltas }, (_, index) => index + 1)
                        const parts: Uint8Array[] = []
                        if (old && old.tag !== _tag) return _fail('image changed')
                        for (let index = 0; index * CHUNK < pages; index++) parts.push(await pack(compose(index, old && index < _sizes.length ? await chunk(index, old.bytes) : null)))
                        _reset(await _put(0, encodeImage(pages, parts), _tag), pages, parts.map((part) => part.length))
                        _stale = stale
                        await _sweep()
                },
                stat: () => ({ base: _pages, deltas: _deltas, patch: _patch }),
        }
}
