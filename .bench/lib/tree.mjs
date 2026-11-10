import { Y } from './side.mjs'

export const VIEW = 'main'

const _isWindow = (key) => key === 'win' || key.startsWith('win/') || key.startsWith('row/') || key.startsWith('deco/')

const _plain = (v) => (v && typeof v.toJSON === 'function' ? v.toJSON() : v)

export const gridOf = (doc) => doc.getMap('grid')

export const winOf = (doc, view = VIEW) => _plain(gridOf(doc).get('win/' + view)) ?? {}

export const keysOf = (doc) => [...gridOf(doc).keys()]

export const windowJson = (doc) => {
        const out = {}
        for (const [key, v] of gridOf(doc).entries()) if (_isWindow(key)) out[key] = _plain(v)
        return out
}

export const byteOf = (v) => Buffer.byteLength(JSON.stringify(v) ?? '')

export const snapshotBytes = (doc) => {
        const copy = new Y.Doc()
        const map = copy.getMap('grid')
        copy.transact(() => {
                for (const [key, v] of gridOf(doc).entries()) if (!_isWindow(key)) map.set(key, _plain(v))
        })
        const bytes = Y.encodeStateAsUpdate(copy).byteLength
        copy.destroy()
        return bytes
}
