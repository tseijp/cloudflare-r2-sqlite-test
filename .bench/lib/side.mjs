import * as Y from 'yjs'
import { headerOf } from './image.mjs'
import { guard } from './sql.mjs'
import { createStorage } from './storage.mjs'

export { Y }

export const createWire = (doc) => {
        let _bytes = 0
        let _count = 0
        doc.on('update', (update) => {
                _bytes += update.byteLength
                _count++
        })
        const reset = () => {
                const out = { bytes: _bytes, count: _count }
                _bytes = 0
                _count = 0
                return out
        }
        return { reset }
}

export const openSide = async (openDb, prefix, storage = createStorage()) => {
        const doc = new Y.Doc()
        const wire = createWire(doc)
        const db = await openDb({ storage, doc, prefix })
        return { db, doc, wire, storage, prefix }
}

export const closeSide = async (side) => {
        if (!side?.db) return
        await guard(() => side.db.close())
        side.doc.destroy()
        side.db = null
}

export const probeSide = async (openDb) => {
        const side = await openSide(openDb, 'probe/')
        const head = headerOf(await side.db.bytes())
        const rows = [['k', 'v'], ...Array.from({ length: 5000 }, (_, k) => [String(k), 'warm ' + k])]
        await guard(() => side.db.load([{ name: 'warm', rows }]))
        await closeSide(side)
        return head
}
