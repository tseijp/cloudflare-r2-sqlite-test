import { performance } from 'node:perf_hooks'
import { headerOf, tablesOf, treeOf } from './image.mjs'
import { csvBytesOf, headOf, recordsOf } from './select.mjs'
import { closeSide, openSide } from './side.mjs'
import { guard } from './sql.mjs'

const _TRIALS = 3

const _median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

const _load = async (openDb, prefix, sheets) => {
        const side = await openSide(openDb, prefix)
        const t0 = performance.now()
        const res = await guard(() => side.db.load(sheets))
        const ms = performance.now() - t0
        return { side, ms, pages: res.value, error: res.error }
}

const _shape = async (side, pages) => {
        const img = await side.db.bytes()
        const head = headerOf(img)
        const table = tablesOf(img).find((t) => t.type === 'table' && t.name === pages[0])
        const tree = table ? treeOf(img, table.rootpage) : { f: 0, depth: 0, leaves: 0, cells: 0 }
        const schema = await side.db.schema()
        const rows = schema.reduce((a, p) => a + Number(p.rows ?? 0), 0)
        return { image: img.byteLength, head, tree, rows, pageRows: schema.map((p) => [p.page, p.rows]) }
}

export const measureIntake = async (openDb, fixture, sheets) => {
        const head = headOf(sheets)
        const csvN = fixture.bytes
        const csvT = csvBytesOf(head)
        const t = await _load(openDb, 'bench/t/', head)
        const n = await _load(openDb, 'bench/n/', sheets)
        const ms = { n: [n.ms], t: [t.ms] }
        for (let k = 1; k < _TRIALS && !n.error && !t.error; k++) {
                const tk = await _load(openDb, `bench/t${k}/`, head)
                await closeSide(tk.side)
                const nk = await _load(openDb, `bench/n${k}/`, sheets)
                await closeSide(nk.side)
                ms.t.push(tk.ms)
                ms.n.push(nk.ms)
        }
        const ok = !n.error && !t.error && Array.isArray(n.pages) && n.pages.length > 0
        if (!ok) return { ok, error: n.error ?? t.error ?? 'load の返りが page 名の配列でない', sides: { n: n.side, t: t.side } }
        const shapeN = await _shape(n.side, n.pages)
        const shapeT = await _shape(t.side, t.pages)
        const value = {
                records: { n: recordsOf(sheets), t: recordsOf(head) },
                rows: { n: shapeN.rows, t: shapeT.rows },
                pages: n.pages,
                pageRows: shapeN.pageRows,
                csvBytes: { n: csvN, t: csvT },
                image: { n: shapeN.image, t: shapeT.image },
                rho: shapeN.image / csvN,
                ms,
                timeRatio: _median(ms.n) / _median(ms.t),
                pageSize: shapeN.head.pageSize,
                usable: shapeN.head.usable,
                tree: { n: shapeN.tree, t: shapeT.tree },
        }
        return { ok, value, sides: { n: n.side, t: t.side }, page: n.pages[0], pageT: t.pages[0] }
}
