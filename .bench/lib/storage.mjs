import { sha256 } from './hash.mjs'

const copyOf = (bytes) => new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))

const sliceOf = (data, range) => {
        if (!range) return data
        if (range.suffix != null) return data.subarray(Math.max(0, data.length - range.suffix))
        return data.subarray(range.offset ?? 0, (range.offset ?? 0) + (range.length ?? data.length))
}

export const createBucket = () => {
        const objects = new Map()
        const etagAt = (key) => (objects.has(key) ? sha256(objects.get(key)) : null)
        const put = async (key, bytes, opts) => {
                const isConflict = opts?.ifNoneMatch === true && objects.has(key)
                const isStale = typeof opts?.etagMatches === 'string' && etagAt(key) !== opts.etagMatches
                if (isConflict || isStale) return null
                objects.set(key, copyOf(bytes))
                return { etag: etagAt(key) }
        }
        const get = async (key, range) => (objects.has(key) ? sliceOf(objects.get(key), range) : null)
        const head = async (key) => (objects.has(key) ? { size: objects.get(key).length, etag: etagAt(key) } : null)
        const list = async (prefix) =>
                [...objects.keys()]
                        .filter((k) => k.startsWith(prefix ?? ''))
                        .sort()
                        .map((key) => ({ key, size: objects.get(key).length }))
        const remove = async (keys) => [].concat(keys).forEach((key) => objects.delete(key))
        return { put, get, head, list, delete: remove }
}

const fresh = () => ({
        puts: 0,
        sent_bytes: 0,
        gets: 0,
        get_bytes: 0,
        suffix_gets: 0,
        range_gets: 0,
        heads: 0,
        lists: 0,
        deletes: 0,
})

export const createCounter = (bucket) => {
        let stats = fresh()
        let log = []
        const get = async (key, range) => {
                const data = await bucket.get(key, range)
                const size = data ? data.byteLength : 0
                stats.gets++
                stats.get_bytes += size
                if (range?.suffix != null) stats.suffix_gets++
                if (range?.offset != null) stats.range_gets++
                log.push({ key, range: range ?? null, size })
                return data
        }
        const tally =
                (name, fn) =>
                (...args) => {
                        stats[name]++
                        return fn(...args)
                }
        const put = (key, bytes, opts) => {
                stats.sent_bytes += bytes ? bytes.byteLength : 0
                return bucket.put(key, bytes, opts)
        }
        const storage = {
                put: tally('puts', put),
                get,
                head: tally('heads', bucket.head),
                list: tally('lists', bucket.list),
                delete: tally('deletes', bucket.delete),
        }
        const reset = () => {
                stats = fresh()
                log = []
        }
        return { storage, reset, stats: () => ({ ...stats }), log: () => log.slice() }
}
