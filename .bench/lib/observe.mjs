import { userCols } from './edit.mjs'
import { WINDOW } from './scan.mjs'
import { guard, quote } from './sql.mjs'
import { byteOf } from './tree.mjs'

export const dumpPair = async (ctx) => ({
        n: byteOf(await ctx.sides.n.db.dump()),
        t: byteOf(await ctx.sides.t.db.dump()),
})

const _hasKeys = (c) => c && typeof c.name === 'string' && typeof c.type === 'string' && c.type !== '' && 'default' in c

const _schema = async (db, pages) => {
        const list = await db.schema()
        const out = []
        for (const page of pages) {
                const entry = list.find((p) => p.page === page)
                const cols = entry?.columns ?? []
                const phys = await userCols(db, page)
                const names = cols.map((c) => c.name)
                const isSame = phys.length === names.length && phys.every((n) => names.includes(n))
                const isKeyed = cols.length > 0 && cols.every(_hasKeys)
                out.push({ page, cols: cols.length, isKeyed, isSame, types: [...new Set(cols.map((c) => c.type))] })
        }
        return { pages: out, ok: out.length === pages.length && out.every((p) => p.isKeyed && p.isSame) }
}

export const measureObserve = async (ctx) => {
        const db = ctx.sides.n.db
        const res = await guard(() => db.sql(`SELECT * FROM ${quote(ctx.page)}`))
        const rows = res.value?.rows?.length ?? null
        const schema = await guard(() => _schema(db, ctx.intake.pages))
        const dump = ctx.dump
        return {
                dump: { ...dump, ratio: dump.n / dump.t, oneWindow: ctx.window.byteLimit },
                sql: { rows, limit: Math.min(WINDOW, ctx.intake.rows.n), error: res.error },
                schema: schema.value ?? { ok: false, error: schema.error },
        }
}
