const _zero = () => ({
        put: 0,
        putBytes: 0,
        list: 0,
        delete: 0,
        deleted: 0,
        get: 0,
        getBytes: 0,
        suffix: 0,
        range: 0,
        whole: 0,
        miss: 0,
})

const _copy = (view) => new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength))

const _toBytes = (bytes) => {
        if (bytes instanceof Uint8Array) return new Uint8Array(bytes)
        if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes.slice(0))
        if (ArrayBuffer.isView(bytes)) return _copy(bytes)
        return new TextEncoder().encode(String(bytes))
}

const _body = (bytes) =>
        Object.assign(bytes, {
                size: bytes.byteLength,
                arrayBuffer: async () => _copy(bytes).buffer,
                bytes: async () => bytes,
        })

const _slice = (all, range) => {
        if (!range) return { kind: 'whole', part: all.subarray(0) }
        const isSuffix = range.suffix !== undefined
        if (isSuffix) return { kind: 'suffix', part: all.subarray(Math.max(0, all.byteLength - range.suffix)) }
        const from = range.offset ?? 0
        const to = range.length === undefined ? all.byteLength : from + range.length
        return { kind: 'range', part: all.subarray(from, to) }
}

export const getLog = (count) => count.log.filter((e) => e.op === 'get').map((e) => [e.kind, e.bytes])

export const createStorage = () => {
        const _map = new Map()
        let _etag = 0
        let _count = _zero()
        let _log = []
        const put = async (key, bytes, opts = {}) => {
                const data = _toBytes(bytes)
                _count.put++
                _count.putBytes += data.byteLength
                _log.push({ op: 'put', key, bytes: data.byteLength })
                const isTaken = opts?.ifNoneMatch && _map.has(key)
                if (isTaken) return null
                _map.set(key, data)
                return { etag: String(++_etag) }
        }
        const get = async (key, range) => {
                _count.get++
                const all = _map.get(key)
                if (!all) {
                        _count.miss++
                        _log.push({ op: 'get', key, bytes: 0, kind: 'miss' })
                        return null
                }
                const { kind, part } = _slice(all, range)
                _count[kind]++
                _count.getBytes += part.byteLength
                _log.push({ op: 'get', key, bytes: part.byteLength, kind, range })
                return _body(new Uint8Array(part))
        }
        const list = async (prefix = '') => {
                _count.list++
                _log.push({ op: 'list', key: prefix })
                const keys = [..._map.keys()].filter((key) => key.startsWith(prefix)).sort()
                return keys.map((key) => ({ key, size: _map.get(key).byteLength }))
        }
        const remove = async (keys) => {
                const all = Array.isArray(keys) ? keys : [keys]
                _count.delete++
                _log.push({ op: 'delete', keys: all.length })
                for (const key of all) if (_map.delete(key)) _count.deleted++
        }
        const reset = () => {
                const out = { ..._count, log: _log }
                _count = _zero()
                _log = []
                return out
        }
        const keys = (prefix = '') => [..._map.keys()].filter((key) => key.startsWith(prefix)).sort()
        const size = (prefix = '') => keys(prefix).reduce((a, key) => a + _map.get(key).byteLength, 0)
        return { put, get, list, delete: remove, reset, keys, size }
}
