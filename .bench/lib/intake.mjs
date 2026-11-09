import { createBaseline } from './baseline.mjs'
import { describeImage, quoteId } from './inspect.mjs'
import { attempt, rowsOf } from './product.mjs'

const declOf = (page) => ({
        name: page.name,
        columns: page.columns.map((c) => ({ name: c.name, type: c.type, optional: true })),
})

const HAVING = `SELECT name FROM sqlite_master m WHERE type = 'table'
        AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) WHERE name = ?)`

const tablesOf = async (image, page) =>
        rowsOf((await attempt(() => image.sql(HAVING, [page.columns[0]?.name]))).value).map((r) => r.name)

const declare = async (image, page) => {
        const before = new Set(await tablesOf(image, page))
        const declared = await attempt(() => image.declare(declOf(page)))
        const after = await tablesOf(image, page)
        const table = after.find((n) => !before.has(n)) ?? (after.includes(page.name) ? page.name : null)
        return { ...declared, table }
}

const insertSql = async (image, page, table) => {
        if (!table) return { ok: false, error: 'table not found after declare' }
        const names = page.columns.map((c) => quoteId(c.name)).join(', ')
        const text = `INSERT INTO ${quoteId(table)} (${names}) VALUES (${page.columns.map(() => '?').join(', ')})`
        const begun = await attempt(() => image.sql('BEGIN'))
        const inserted = await attempt(async () => {
                for (const row of page.rows) await image.sql(text, row)
        })
        const end = await attempt(() => begun.ok && image.sql(inserted.ok ? 'COMMIT' : 'ROLLBACK'))
        const method = begun.ok ? 'sql transaction' : 'sql autocommit'
        return { ok: inserted.ok && end.ok, error: inserted.error ?? end.error, method }
}

const insertOps = (image, page) =>
        attempt(async () => {
                const names = page.columns.map((c) => c.name)
                const valuesOf = (row) => Object.fromEntries(names.map((n, i) => [n, row[i]]))
                for (const row of page.rows)
                        await image.edit({ kind: 'row.add', page: page.name, values: valuesOf(row) })
                return 'row.add'
        })

const loadImage = async (product, side) => {
        const opened = await product.open(side.input)
        if (!opened.ok) return { ok: false, error: opened.error, stage: 'openDb' }
        side.db = opened.value
        const tables = {}
        const t0 = performance.now()
        let method = null
        for (const page of side.pages) {
                const declared = await declare(side.db.image, page)
                if (!declared.ok) return { ok: false, error: declared.error, stage: 'declare' }
                tables[page.name] = declared.table
                const viaSql = await insertSql(side.db.image, page, declared.table)
                const viaOps = viaSql.ok ? null : await insertOps(side.db.image, page)
                if (viaOps && !viaOps.ok)
                        return { ok: false, error: `${viaSql.error} / ${viaOps.error}`, stage: 'insert' }
                method = viaOps ? viaOps.value : viaSql.method
        }
        const ms = performance.now() - t0
        await attempt(() => side.db.image.checkpoint())
        return { ok: true, ms, method, tables }
}

const describe = async (loaded, side, page) => {
        if (!loaded.ok) return null
        side.table = loaded.tables[page]
        const bytes = await attempt(() => side.db.image.bytes())
        return bytes.ok ? describeImage(bytes.value, side.table) : null
}

const baselineOf = ({ full, tenth, pageSize, csvBytes }) => {
        full.base = createBaseline(full, pageSize)
        tenth.base = createBaseline(tenth, pageSize)
        const size = full.base.size()
        const { ms } = full.base
        return { ms, ms_tenth: tenth.base.ms, time_ratio: ms / tenth.base.ms, image_bytes: size, rho: size / csvBytes }
}

export const measureIntake = async (ctx) => {
        const { product, full, tenth, page, csvBytes } = ctx
        const baseline = baselineOf(ctx)
        if (!product.ok) return { ok: false, error: 'product missing', baseline }
        const loaded = await loadImage(product, full)
        const loadedTenth = loaded.ok ? await loadImage(product, tenth) : { ok: false, error: 'skipped' }
        full.shape = await describe(loaded, full, page)
        tenth.shape = await describe(loadedTenth, tenth, page)
        const isOk = loaded.ok && loadedTenth.ok
        return {
                ok: isOk,
                error: loaded.error ?? loadedTenth.error ?? null,
                stage: loaded.stage ?? loadedTenth.stage ?? null,
                method: loaded.method ?? null,
                ms: loaded.ms ?? null,
                ms_tenth: loadedTenth.ms ?? null,
                time_ratio: isOk ? loaded.ms / loadedTenth.ms : null,
                image_bytes: full.shape?.bytes ?? null,
                image_bytes_tenth: tenth.shape?.bytes ?? null,
                rho: full.shape ? full.shape.bytes / csvBytes : null,
                tables: loaded.tables ?? null,
                rows: full.shape?.rows ?? null,
                rows_tenth: tenth.shape?.rows ?? null,
                baseline,
        }
}
