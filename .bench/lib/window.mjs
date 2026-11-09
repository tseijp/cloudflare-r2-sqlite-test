import { WINDOW } from './scan.mjs'
import { closeSide, openSide } from './side.mjs'
import { guard, settle } from './sql.mjs'
import { getLog } from './storage.mjs'
import { byteOf, windowJson, winOf } from './tree.mjs'

export const formulaPages = (tree, rows) => Math.ceil(rows / Math.max(tree.f, 1e-9)) + Math.max(tree.depth, 1) - 1

const _isPage = (e) => e.op === 'get' && (e.kind === 'range' || e.kind === 'whole')

const _pagesOf = (count, pageSize) => count.log.filter(_isPage).reduce((a, e) => a + Math.ceil(e.bytes / pageSize), 0)

export const firstWindow = async (openDb, side, page, pageSize) => {
        side.storage.reset()
        const reopened = await openSide(openDb, side.prefix, side.storage)
        const res = await guard(() => reopened.db.move({ page, from: 1, to: WINDOW }))
        await settle()
        const count = side.storage.reset()
        const out = {
                error: res.error,
                gets: count.get,
                getBytes: count.getBytes,
                suffix: count.suffix,
                rangeGets: count.range + count.whole,
                pages: _pagesOf(count, pageSize),
                classA: count.put + count.list + count.delete,
                firstIsIndex: count.log.find((e) => e.op === 'get')?.kind === 'suffix',
                returned: byteOf(windowJson(reopened.doc)),
                log: getLog(count),
                ids: (winOf(reopened.doc).ids ?? []).length,
        }
        return { out, reopened }
}

const _saved = (res) => res.value ?? res.error

export const measureWindow = async (openDb, ctx) => {
        const { intake } = ctx
        const saved = { n: await guard(() => ctx.sides.n.db.save()), t: await guard(() => ctx.sides.t.db.save()) }
        const n = await firstWindow(openDb, ctx.sides.n, ctx.page, intake.pageSize)
        const t = await firstWindow(openDb, ctx.sides.t, ctx.pageT, intake.pageSize)
        await closeSide(n.reopened)
        await closeSide(t.reopened)
        const rows = Math.min(WINDOW, intake.rows.n)
        const rowByte = intake.csvBytes.n / intake.records.n
        const rowsT = Math.min(WINDOW, intake.rows.t)
        const formula = { n: formulaPages(intake.tree.n, rows), t: formulaPages(intake.tree.t, rowsT) }
        const ratio = t.out.pages > 0 ? n.out.pages / t.out.pages : n.out.pages > 0 ? Infinity : 1
        const limit = rowByte * rows * 1.5
        return {
                saved: { n: _saved(saved.n), t: _saved(saved.t) },
                n: n.out,
                t: t.out,
                formula,
                pageRatio: ratio,
                formulaRatio: formula.n / formula.t,
                rowByte,
                rows,
                byteLimit: limit,
                byteRate: n.out.returned / limit,
                readShare: n.out.getBytes / intake.image.n,
                isSmall: ctx.fixture.class.scale === '小',
        }
}
