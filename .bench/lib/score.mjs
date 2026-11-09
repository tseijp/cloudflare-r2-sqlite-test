export const MAX = { 取込: 150, 窓: 150, 編集: 200, 保存: 200, 装飾: 100, 同期: 100, 観測: 100 }

const _steps = (over, unit) => (over > 1e-9 ? Math.ceil(over / unit - 1e-9) : 0)

const _item = (key, value, limit, ok, minus) => ({ key, value, limit, ok: !!ok, minus: ok ? 0 : minus })

const _sum = (max, items) => Math.max(0, max - items.reduce((a, i) => a + i.minus, 0))

const _intake = (m) => {
        const v = m.intake
        const rho = _item('ρ', v.rho, 1.3, v.rho <= 1.3, 10 * _steps(v.rho - 1.3, 0.1))
        const time = _item('時間比', v.timeRatio, [8, 12], v.timeRatio >= 8 && v.timeRatio <= 12, 30)
        return [rho, time]
}

const _window = (m) => {
        const w = m.window
        const one = w.formula.n
        const ratio = w.isSmall ? w.n.pages / one : w.pageRatio
        const limit = w.isSmall ? 1 : 1.1
        const key = w.isSmall ? 'P(N) ÷ 窓 1 つ分' : 'P(N) ÷ P(N/10)'
        const pages = _item(key, ratio, limit, ratio <= limit, 15 * _steps(ratio - limit, 0.1))
        const rate = w.byteRate
        const bytes = _item('返した byte ÷ (行 byte × 行数 × 1.5)', rate, 1, rate <= 1, 10 * _steps(rate - 1, 0.1))
        return [pages, bytes]
}

const _edit = (m) => {
        const e = m.edit
        const fr = (x) => x.frames
        const one = _item('1 cell', fr(e.one), 1, fr(e.one) === 1 && e.isApplied, 0)
        const rest = [
                _item('同値再確定', fr(e.same), 0, fr(e.same) === 0, 40),
                _item('行追加', fr(e.rowAdd), 2, fr(e.rowAdd) !== null && fr(e.rowAdd) <= 2, 40),
                _item('列追加', fr(e.colAdd), 1, fr(e.colAdd) === 1, 40),
                _item('改名', fr(e.rename), 1, fr(e.rename) === 1, 40),
                _item('50 cell', fr(e.bulk), e.bulk.limit, fr(e.bulk) !== null && fr(e.bulk) <= e.bulk.limit, 40),
        ]
        const base = one.ok ? 200 : fr(e.one) === 2 ? 100 : 0
        one.minus = 200 - base
        return [one, ...rest]
}

const _save = (m) => {
        const s = m.save
        const r = s.restore
        return [
                _item('送った byte ÷ (汚れた page × page size)', s.ratio, 1.5, s.ratio <= 1.5,
                        20 * _steps(s.ratio - 1.5, 0.5)),
                _item('1 save の put', s.puts, 1, s.puts === 1, 40),
                _item('100 save 後の object 数', s.hundred.objects, 20, s.hundred.objects <= 20 && !s.hundred.errors, 40),
                _item('開き直しの GET 回数', r.open.gets, 20, r.open.gets <= 20, 40),
                _item('開き直しの GET byte ÷ image', r.open.share, 0.05, r.open.share <= 0.05, 40),
                _item('復元の整合', r.isOk, true, r.isOk, 40),
        ]
}

const _style = (m) => {
        const d = m.style
        const isVacuous = !(d.written.styles > 0 && d.written.marks > 0)
        return [
                _item('装飾が書けた', d.written, '>0', !isVacuous, 100),
                _item('孤児', d.orphans, 0, d.orphans === 0, 0),
                _item('空にした後の style 残存', d.kept, 1, d.kept >= 1, 50),
                _item('run 位置不正', d.badRuns, 0, d.badRuns === 0, 10 * d.badRuns),
        ]
}

const _sync = (m) => {
        const y = m.sync
        return [
                _item('1 cell wire ÷ (行 byte × 1.5)', y.one.bytes / y.one.limit, 1, y.one.bytes <= y.one.limit, 25),
                _item('窓入替 wire ÷ (窓 JSON × 1.3)', y.swap.bytes / y.swap.limit, 1, y.swap.bytes <= y.swap.limit, 25),
                _item('tree snapshot N ÷ N/10', y.snapshot.ratio, 1.1, y.snapshot.ratio <= 1.1, 25),
                _item('窓入替が undo に積まれない', y.undo.ok, true, y.undo.ok, 25),
        ]
}

const _observe = (m) => {
        const o = m.observe
        const isSmall = m.window.isSmall
        const dump = isSmall ? o.dump.n / o.dump.oneWindow : o.dump.ratio
        const limit = isSmall ? 1 : 1.1
        return [
                _item(isSmall ? 'dump ÷ 窓 1 つ分' : 'dump N ÷ N/10', dump, limit, dump <= limit, 35),
                _item('SQL の返り行数', o.sql.rows, o.sql.limit, o.sql.rows !== null && o.sql.rows <= o.sql.limit, 35),
                _item('schema の列名と型と既定値', o.schema.ok, true, o.schema.ok, 35),
        ]
}

const _KEY = { 取込: 'intake', 窓: 'window', 編集: 'edit', 保存: 'save', 装飾: 'style', 同期: 'sync', 観測: 'observe' }

const _AXES = { 取込: _intake, 窓: _window, 編集: _edit, 保存: _save, 装飾: _style, 同期: _sync, 観測: _observe }

const _perFixture = (axis, m) => {
        if (!m.intake?.rho) return { score: 0, items: [_item('取り込み', false, true, false, MAX[axis])] }
        const items = m[_KEY[axis]]?.error ? [_item('計測', m[_KEY[axis]].error, 'ok', false, MAX[axis])] : _AXES[axis](m)
        return { score: _sum(MAX[axis], items), items }
}

export const scoreRun = (measured) => {
        const fails = measured.filter((m) => !m.intake?.rho).length
        const axes = {}
        for (const axis of Object.keys(MAX)) {
                const per = measured.map((m) => ({ file: m.file, ..._perFixture(axis, m) }))
                const isIntake = axis === '取込'
                const pool = isIntake ? per.filter((p, k) => measured[k].intake?.rho) : per
                const worst = pool.length ? Math.min(...pool.map((p) => p.score)) : 0
                const score = isIntake ? Math.max(0, worst - 50 * fails) : worst
                axes[axis] = { score, max: MAX[axis], per }
        }
        return { axes, sum: Object.values(axes).reduce((a, x) => a + x.score, 0), fails }
}
