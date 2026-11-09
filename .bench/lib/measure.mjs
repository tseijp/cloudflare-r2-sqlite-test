import { createBaseline } from './baseline.mjs'
import { measureEdit } from './edit.mjs'
import { measureIntake } from './intake.mjs'
import { measureObserve } from './observe.mjs'
import { editOps } from './ops.mjs'
import { attempt, txidOf } from './product.mjs'
import { createProbe } from './replica.mjs'
import { loadFixture, mainPageOf } from './scan.mjs'
import { createBucket, createCounter } from './storage.mjs'
import { measureStyle } from './style.mjs'
import { createTree, measureSync } from './sync.mjs'
import { measureWindow } from './window.mjs'

const tenthOf = (pages) => pages.map((p) => ({ ...p, rows: p.rows.slice(0, Math.floor(p.rows.length / 10)) }))

const sideOf = (pages) => {
        const counter = createCounter(createBucket())
        const tree = createTree()
        return { pages, counter, ...tree, input: { storage: counter.storage, doc: tree.doc } }
}

const txidAt = async (image) => {
        if (!image) return 0
        if (Number(image.txid) > 0) return Number(image.txid)
        return txidOf((await attempt(() => image.frames(0))).value ?? [])
}

const editBaseOf = async ({ full, page, pageSize }) => {
        const bytes = await attempt(() => full.db.image.bytes())
        if (!bytes.ok) return { ...full.base, source: 'runner ddl', table: page, close: () => {} }
        return { ...createBaseline({ bytes: bytes.value }, pageSize), source: 'product image', table: full.table }
}

const contextOf = (fixture, product, pageSize, w) => {
        const main = mainPageOf(fixture.pages)
        const names = main.columns.map((c) => c.name)
        const text = main.columns.find((c) => c.type === 'text')
        const textCol = text?.name ?? names[0]
        const value = text ? `bench-${Date.now().toString(36)}` : 1234567
        const rows = fixture.pages.reduce((n, p) => n + p.rows.length, 0)
        const ids = Array.from({ length: 61 }, (_, i) => i + 1)
        const sides = { full: sideOf(fixture.pages), tenth: sideOf(tenthOf(fixture.pages)) }
        const otherCol = names.find((n) => n !== textCol) ?? textCol
        const csvBytes = fixture.csv_bytes
        return {
                product,
                pageSize,
                w,
                main,
                page: main.name,
                textCol,
                otherCol,
                value,
                ids,
                csvBytes,
                ...sides,
                rowBytes: csvBytes / rows,
        }
}

const measureChanges = async (ctx) => {
        const image = ctx.full.db?.image ?? null
        const base = await editBaseOf(ctx)
        const txid0 = await txidAt(image)
        const probe = await createProbe({
                ...ctx,
                db: ctx.full.db,
                counter: ctx.full.counter,
                txid0,
                table: ctx.full.table,
        })
        const onFrames = async (info) => {
                await probe.push(info)
                if (info.name === 'row_add') await probe.mark('row_add', info.txid)
        }
        const ops = editOps({ page: ctx.page, table: base.table, col: ctx.textCol, ids: ctx.ids, value: ctx.value })
        const f = ctx.full.shape?.f ?? 0
        const edit = await measureEdit({ image, base, ops, f, fBase: base.shape(base.table).f, txid0, onFrames })
        const replica = await probe.finish()
        base.close()
        return { txid0, edit, replica }
}

export const measureFixture = async (target, product, pageSize, w, log) => {
        const t0 = performance.now()
        const fixture = loadFixture(target)
        const ctx = contextOf(fixture, product, pageSize, w)
        const step = (name) => log(`${target.name}: ${name}`)
        step('intake')
        const intake = await measureIntake(ctx)
        step('window')
        const window = await measureWindow(ctx)
        step('edit + replica')
        const changes = await measureChanges(ctx)
        step('style')
        const style = await measureStyle(ctx)
        step('sync')
        const sync = await measureSync(ctx)
        step('observe')
        const observe = await measureObserve({ ...ctx, isSmall: window.is_small ?? false })
        ctx.full.base.close()
        ctx.tenth.base.close()
        const { name, role, class: label } = target
        const shape = {
                page: ctx.page,
                rows: ctx.main.rows.length,
                cols: ctx.main.columns.length,
                pages: fixture.pages.length,
        }
        const sizes = {
                csv_bytes: ctx.csvBytes,
                row_bytes: ctx.rowBytes,
                text_col: ctx.textCol,
                ms: performance.now() - t0,
        }
        return { name, role, class: label, ...shape, ...sizes, intake, window, ...changes, style, sync, observe }
}
