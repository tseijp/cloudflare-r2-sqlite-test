import { attempt, rowsOf } from './product.mjs'

const MARKS_LONG = [
        { from: 0, to: 5, attr: 'bold', val: '1' },
        { from: 6, to: 11, attr: 'color', val: '#f00' },
]

const MARKS_SHORT = [{ from: 0, to: 2, attr: 'bold', val: '1' }]

const countBadRuns = (res) => {
        if (!Array.isArray(res?.marks)) return null
        const rows = new Map(rowsOf(res).map((r) => [r._id, r]))
        const lengthOf = (m) => String(rows.get(m.row)?.[m.col] ?? '').length
        return res.marks.filter((m) => m.to > lengthOf(m) || m.from < 0 || m.from > m.to).length
}

export const measureStyle = async ({ full, page, textCol, otherCol, ids, w }) => {
        const image = full.db?.image
        if (!image) return { ok: false, error: 'image facet missing' }
        const marker = `bench-style-${Date.now().toString(36)}`
        const json = JSON.stringify({ fill: marker })
        const steps = []
        const run = async (name, fn) => {
                const r = await attempt(fn)
                steps.push({ name, ok: r.ok, error: r.error })
                return r
        }
        const [rowA, rowB, rowC] = [ids[10], ids[20], ids[30]]
        const req = { page, from: 0, to: w }
        const cell = (row, value, marks) => ({ kind: 'cell', page, row, col: textCol, value, marks })
        await run('style_set', () => image.edit({ kind: 'style', page, row: rowA, col: textCol, json }))
        await run('cell_clear', () => image.edit(cell(rowA, null)))
        const shown = await run('window', () => image.window(req))
        await run('marks_long', () => image.edit(cell(rowB, 'bench marks text', MARKS_LONG)))
        await run('marks_short', () => image.edit(cell(rowB, 'ab', MARKS_SHORT)))
        const marked = await run('window_marks', () => image.window(req))
        await run('style_row', () => image.edit({ kind: 'style', page, row: rowC, col: textCol, json }))
        await run('row_remove', () => image.edit({ kind: 'row.remove', page, row: rowC }))
        await run('style_col', () => image.edit({ kind: 'style', page, row: rowA, col: otherCol, json }))
        await run('col_hide', () => image.edit({ kind: 'col.hide', page, name: otherCol }))
        await run('window_sorted', () => image.window({ ...req, order: { col: textCol, dir: 'desc' } }))
        const orphans = await run('orphans', () => image.orphans())
        return {
                ok: steps.every((s) => s.ok),
                error: steps.find((s) => !s.ok)?.error ?? null,
                steps,
                persisted: JSON.stringify(shown.value ?? null).includes(marker),
                bad_runs: countBadRuns(marked.value),
                marks_seen: marked.value?.marks?.filter((m) => m.row === rowB).length ?? null,
                orphans: orphans.value,
                rows: { style: rowA, marks: rowB, removed: rowC },
                cols: { text: textCol, hidden: otherCol },
        }
}
