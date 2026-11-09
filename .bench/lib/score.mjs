export const AXES = { intake: 150, window: 150, edit: 200, replica: 200, style: 100, sync: 100, observe: 100 }

const EPS = 1e-9

const over = (value, limit, step) => (value > limit + EPS ? Math.ceil((value - limit - EPS) / step) : 0)

const clamp = (points, max) => Math.max(0, Math.min(max, Math.round(points)))

const checked = (max, step, checks, values) => {
        const notes = Object.keys(checks).filter((k) => !checks[k])
        return { points: clamp(max - step * notes.length, max), notes, values }
}

const intakeOf = (m) => {
        const values = {
                rho: m.rho,
                time_ratio: m.time_ratio,
                baseline_rho: m.baseline.rho,
                baseline_time: m.baseline.time_ratio,
        }
        if (!m.ok) return { failed: true, penalty: 0, notes: [m.error], values }
        const rhoOver = over(m.rho, 1.3, 0.1)
        const isTimeOk = m.time_ratio >= 8 && m.time_ratio <= 12
        const notes = [rhoOver && 'rho', !isTimeOk && 'time_ratio'].filter(Boolean)
        return { penalty: 10 * rhoOver + (isTimeOk ? 0 : 30), notes, values }
}

const SCORERS = {
        window: (m) => {
                const values = { pages: m.pages, ratio: m.ratio, byte_ratio: m.byte_ratio, read_ratio: m.read_ratio }
                const ratioOver = m.is_small || m.ratio == null ? 0 : over(m.ratio, 1.1, 0.1)
                const excess = m.byte_ratio == null ? 0 : over((m.byte_ratio - 1) * 100, 0, 10)
                const notes = [ratioOver && 'page_ratio', excess && 'bytes'].filter(Boolean)
                return { points: clamp(AXES.window - 15 * ratioOver - 10 * excess, AXES.window), notes, values }
        },
        edit: (m) => {
                const values = Object.fromEntries(Object.entries(m.items).map(([k, v]) => [k, [v.product, v.baseline]]))
                const cell = m.items.cell.product
                const rest = ['cell_same', 'row_add', 'col_add', 'col_rename', 'batch50'].filter(
                        (k) => !m.items[k].pass,
                )
                const base = cell === 1 ? AXES.edit : cell === 2 ? AXES.edit / 2 : 0
                const notes = [...(cell === 1 ? [] : ['cell']), ...rest]
                return { points: clamp(base - 40 * rest.length, AXES.edit), notes, values }
        },
        replica: (m) => {
                const values = { ratio: m.ratio, restore_match: m.restore_match, index_first: m.index_first }
                const ratioOver = m.ratio == null ? 0 : over(m.ratio, 1.5, 0.5)
                const notes = [ratioOver && 'sent_ratio', !m.index_first && 'index_first'].filter(Boolean)
                return {
                        points: clamp(AXES.replica - 20 * ratioOver - (m.index_first ? 0 : 60), AXES.replica),
                        notes,
                        values,
                }
        },
        style: (m) => {
                const values = { orphans: m.orphans, persisted: m.persisted, bad_runs: m.bad_runs }
                const badRuns = m.bad_runs ?? 1
                const notes = [!m.persisted && 'persisted', badRuns && 'bad_runs'].filter(Boolean)
                return { points: clamp(AXES.style - (m.persisted ? 0 : 50) - 10 * badRuns, AXES.style), notes, values }
        },
        sync: (m) =>
                checked(
                        25 * 4,
                        25,
                        {
                                cell_wire: m.cell_wire <= m.cell_limit,
                                window_wire: m.window_wire <= m.window_limit,
                                snapshot_ratio: m.snapshot_ratio != null && m.snapshot_ratio <= 1.1,
                                undo_excluded: m.undo_excluded === true,
                        },
                        { cell_ratio: m.cell_ratio, window_ratio: m.window_ratio, snapshot_ratio: m.snapshot_ratio },
                ),
        observe: (m) =>
                checked(
                        AXES.observe,
                        35,
                        {
                                dump_ratio: m.is_small || (m.dump_ratio != null && m.dump_ratio <= 1.1),
                                sql_capped: m.sql_capped === true,
                                schema: m.schema_ok === true,
                        },
                        { dump_ratio: m.dump_ratio, sql_rows: m.sql_rows, schema_columns: m.schema_columns },
                ),
}

const intakeAxis = (results) => {
        const per = results.map((r) => ({ fixture: r.name, ...intakeOf(r.intake) }))
        const failed = results.length ? per.filter((p) => p.failed).length : 1
        const worst = Math.max(0, ...per.map((p) => p.penalty))
        const method = '150 - 50 per failed fixture - worst (rho + time) penalty'
        return {
                points: clamp(AXES.intake - 50 * failed - worst, AXES.intake),
                max: AXES.intake,
                method,
                per_fixture: per,
        }
}

const scoreOf = (name, m) =>
        m?.ok || (name === 'edit' && m?.items?.cell?.product != null)
                ? SCORERS[name](m)
                : { points: 0, notes: [m?.error] }

const minAxis = (name, results) => {
        const per = results.map((r) => ({ fixture: r.name, ...scoreOf(name, r[name]) }))
        const points = per.length ? Math.min(...per.map((p) => p.points)) : 0
        return { points, max: AXES[name], method: 'min over fixtures', per_fixture: per }
}

export const scoreAll = (results) => {
        const axes = { intake: intakeAxis(results) }
        for (const name of Object.keys(SCORERS)) axes[name] = minAxis(name, results)
        return { axes, total: Object.values(axes).reduce((n, a) => n + a.points, 0) }
}
