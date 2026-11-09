import { bump, pickCell, valueAt } from './edit.mjs'
import { WINDOW } from './scan.mjs'
import { guard, settle } from './sql.mjs'
import { byteOf, gridOf, snapshotBytes, windowJson, winOf } from './tree.mjs'

export const snapshotPair = (ctx) => ({ n: snapshotBytes(ctx.sides.n.doc), t: snapshotBytes(ctx.sides.t.doc) })

const _plainAt = (doc, key) => {
        const v = gridOf(doc).get(key)
        return v && typeof v.toJSON === 'function' ? v.toJSON() : (v ?? null)
}

const _watch = (doc) => {
        const _keys = new Set()
        const _fn = (events) => {
                for (const ev of events) {
                        if (ev.path.length) _keys.add(String(ev.path[0]))
                        else for (const k of ev.keysChanged ?? []) _keys.add(k)
                }
        }
        gridOf(doc).observeDeep(_fn)
        const stop = () => {
                gridOf(doc).unobserveDeep(_fn)
                return Object.fromEntries([..._keys].map((k) => [k, byteOf(_plainAt(doc, k))]))
        }
        return { stop }
}

const _move = async (side, page, from) => {
        const res = await guard(() => side.db.move({ page, from, to: from + WINDOW - 1 }))
        await settle()
        return res
}

const _wireOne = async (side, page, rowByte) => {
        await _move(side, page, 1)
        const cell = await pickCell(side.db, page)
        side.wire.reset()
        const watch = _watch(side.doc)
        const op = { kind: 'cells', page, cells: [{ row: cell.id, col: cell.col, value: bump(cell.value) }] }
        const res = await guard(() => side.db.act(op))
        await settle()
        const wire = side.wire.reset()
        return { bytes: wire.bytes, updates: wire.count, limit: rowByte * 1.5, keys: watch.stop(), error: res.error }
}

const _wireSwap = async (side, page) => {
        side.wire.reset()
        const res = await _move(side, page, WINDOW + 1)
        const wire = side.wire.reset()
        const json = byteOf(windowJson(side.doc))
        return { bytes: wire.bytes, updates: wire.count, windowJson: json, limit: json * 1.3, error: res.error }
}

const _undo = async (side, page) => {
        await _move(side, page, 1)
        const cell = await pickCell(side.db, page)
        const before = await valueAt(side.db, page, cell.id, cell.col)
        const rev0 = winOf(side.doc).rev
        await side.db.act({ kind: 'cells', page, cells: [{ row: cell.id, col: cell.col, value: bump(before) }] })
        const edited = await valueAt(side.db, page, cell.id, cell.col)
        const rev1 = winOf(side.doc).rev
        await _move(side, page, WINDOW + 1)
        const rev2 = winOf(side.doc).rev
        const res = await guard(() => side.db.undo())
        await settle()
        const after = await valueAt(side.db, page, cell.id, cell.col)
        const win = winOf(side.doc)
        const isReverted = after === before && edited !== before
        const isKept = Number(win.from) === WINDOW + 1
        const rev = { act: rev1 - rev0, move: rev2 - rev1 }
        const ok = isReverted && isKept
        return { before, edited, after, winFrom: win.from ?? null, isReverted, isKept, ok, rev, error: res.error }
}

export const measureSync = async (ctx) => {
        const side = ctx.sides.n
        const page = ctx.page
        const rowByte = ctx.intake.csvBytes.n / ctx.intake.records.n
        const one = await guard(() => _wireOne(side, page, rowByte))
        const swap = await guard(() => _wireSwap(side, page))
        const undo = await guard(() => _undo(side, page))
        const snap = ctx.snapshot
        return {
                one: one.value ?? { error: one.error },
                swap: swap.value ?? { error: swap.error },
                snapshot: { ...snap, ratio: snap.n / snap.t },
                undo: undo.value ?? { ok: false, error: undo.error },
                rowByte,
        }
}
