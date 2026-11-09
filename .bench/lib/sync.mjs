import * as Y from 'yjs'
import { attempt, jsonBytes, rowsOf } from './product.mjs'

const ROW_KEY = /^rows\/(\d+)/

export const createTree = () => {
        const doc = new Y.Doc()
        let wire = 0
        doc.on('update', (u) => void (wire += u.byteLength))
        const take = () => {
                const v = wire
                wire = 0
                return v
        }
        return { doc, take }
}

const mapsOf = (doc) => [...doc.share.keys()].map((name) => [name, doc.getMap(name)])

const windowOf = (doc) =>
        mapsOf(doc)
                .map(([, map]) => map.get('win'))
                .find((w) => w && Array.isArray(w.ids)) ?? null

export const treeSnapshotBytes = (doc) => {
        const copy = new Y.Doc()
        for (const [name, map] of mapsOf(doc)) {
                const ids = new Set((map.get('win')?.ids ?? []).map(String))
                const isWindowKey = (key) => ids.has(ROW_KEY.exec(key)?.[1])
                const target = copy.getMap(name)
                for (const [key, value] of Object.entries(map.toJSON())) if (!isWindowKey(key)) target.set(key, value)
        }
        return Y.encodeStateAsUpdate(copy).byteLength
}

const valueAt = (res, id, col) => rowsOf(res).find((r) => r._id === id)?.[col] ?? null

const missing = (error) => ({ ok: false, error })

export const measureSync = async ({ full, tenth, page, textCol, ids, rowBytes, w }) => {
        if (!full.db?.window || !tenth.db?.window) return missing('window facet missing')
        const win = full.db.window
        const reqA = { page, from: 0, to: w }
        const reqB = { page, from: Math.floor(w / 2), to: w + Math.floor(w / 2) }
        const row = ids[w - 5]
        const op = { kind: 'cell', page, row, col: textCol, value: 'bench sync' }
        const moveA = await attempt(() => win.move(reqA))
        await attempt(() => tenth.db.window.move(reqA))
        const before = await attempt(() => full.db.image.window(reqA))
        const original = valueAt(before.value, row, textCol)
        full.take()
        const acted = await attempt(() => win.act(op))
        const cellWire = full.take()
        const moveB = await attempt(() => win.move(reqB))
        const windowWire = full.take()
        const shown = await attempt(() => full.db.image.window(reqB))
        const windowJson = jsonBytes(shown.value)
        const applied = valueAt(shown.value, row, textCol)
        await attempt(() => tenth.db.window.act(op))
        await attempt(() => tenth.db.window.move(reqB))
        const snapshotBytes = treeSnapshotBytes(full.doc)
        const snapshotTenth = treeSnapshotBytes(tenth.doc)
        const layout = await attempt(() => win.layout?.snapshot?.()?.byteLength ?? null)
        const undone = await attempt(() => win.undo())
        const after = await attempt(() => full.db.image.window(reqA))
        const restored = valueAt(after.value, row, textCol)
        const kept = windowOf(full.doc)
        const isKept = Boolean(kept) && kept.from === reqB.from && kept.to === reqB.to
        return {
                ok: moveA.ok && acted.ok && moveB.ok && undone.ok && after.ok,
                error: moveA.error ?? acted.error ?? moveB.error ?? undone.error ?? after.error ?? null,
                cell_wire: cellWire,
                row_bytes: rowBytes,
                cell_limit: rowBytes * 1.5,
                cell_ratio: cellWire / (rowBytes * 1.5),
                window_wire: windowWire,
                window_json: windowJson,
                window_limit: windowJson * 1.3,
                window_ratio: windowJson ? windowWire / (windowJson * 1.3) : null,
                snapshot_bytes: snapshotBytes,
                snapshot_bytes_tenth: snapshotTenth,
                snapshot_ratio: snapshotTenth ? snapshotBytes / snapshotTenth : null,
                layout_bytes: layout.value ?? null,
                undo_row: row,
                undo_values: { original, applied, after_undo: restored },
                window_kept: isKept,
                undo_excluded: isKept && applied === op.value && restored === original && restored !== op.value,
                top_keys: [...full.doc.share.keys()],
        }
}
