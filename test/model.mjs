const _CTRL = /[\u0000-\u001f\u007f]/
const _WRITE = /^\s*(insert|update|delete|create|drop|alter|replace|pragma|attach|detach|begin|commit|rollback|vacuum|reindex)\b/i
const _READ = /^select (count\(\*\)|\*) from "([^"]+)"(?: where "_id" >= (\d+) order by "_id" limit (\d+))?$/

export const fold = (s) => String(s).replace(/[A-Z]/g, (c) => c.toLowerCase())
export const key = (...parts) => JSON.stringify(parts)
export const byJson = (a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)
export const maxId = (p) => {
        let m = 0
        for (const k of p.rows.keys()) if (k > m) m = k
        return m
}
const _isName = (s) => typeof s === 'string' && s.length >= 1 && s.length <= 64 && !s.startsWith('_') && !fold(s).startsWith('sqlite_') && !['rowid', 'oid'].includes(fold(s)) && !_CTRL.test(s)
const _isId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(s)
const _isInt = (n, min, max = Infinity) => Number.isInteger(n) && n >= min && n <= max
const _isText = (s) => s === null || typeof s === 'string'
const _isMark = (m) => Array.isArray(m) && _isInt(m[0], 0) && _isInt(m[1], 0) && _isId(m[2]) && typeof m[3] === 'string'
const _isNames = (ns) => Array.isArray(ns) && ns.length > 0 && ns.every(_isName) && new Set(ns.map(fold)).size === ns.length
const _isRows = (rows) => Array.isArray(rows) && rows.every((r) => Array.isArray(r) && r.every(_isText))
const _CHECK = {
        open: () => true,
        save: () => true,
        'page.add': (o) => _isName(o.page),
        'page.del': (o) => _isName(o.page),
        'row.add': (o) => _isName(o.page),
        'row.del': (o) => _isName(o.page) && _isInt(o.row, 0),
        'col.add': (o) => _isName(o.page) && _isName(o.col),
        'col.del': (o) => _isName(o.page) && _isName(o.col),
        'col.name': (o) => _isName(o.page) && _isName(o.col) && _isName(o.name),
        cell: (o) => _isId(o.id) && _isName(o.page) && _isInt(o.row, 0) && _isName(o.col) && _isText(o.text) && Array.isArray(o.marks) && o.marks.every(_isMark),
        style: (o) => _isId(o.id) && _isName(o.page) && _isInt(o.row, 0) && _isName(o.col) && _isId(o.name) && _isText(o.value),
        window: (o) => _isId(o.id) && _isName(o.page) && _isInt(o.top, 0) && _isInt(o.size, 1, 200),
        import: (o) => _isName(o.page) && _isNames(o.names) && _isRows(o.rows),
        undo: (o) => _isId(o.id),
        redo: (o) => _isId(o.id),
        leave: (o) => _isId(o.id),
        sql: (o) => typeof o.text === 'string',
}
export const isValid = (op) => !!(op && _CHECK[op.type] && _CHECK[op.type](op))
const _trim = (text, marks) => marks.map(([a, b, n, v]) => [a, Math.min(b, (text ?? '').length), n, v]).filter(([a, b]) => a < b)

export const createModel = () => {
        let pages = []
        let styles = new Map()
        let marks = new Map()
        const windows = new Map()
        const history = new Map()
        const writers = new Map()
        const _ok = (result, changed = true) => ({ status: 'ok', changed, result })
        const _either = () => ({ status: 'either', changed: false })
        const _page = (name) => pages.find((p) => fold(p.name) === fold(name))
        const _col = (p, name) => p.cols.find((c) => fold(c) === fold(name))
        const _hist = (id) => history.get(id) ?? history.set(id, { undo: [], redo: [], poison: false }).get(id)
        const _poison = (id) => ((_hist(id).poison = true), _ok(undefined, false))
        const _next = (p) => (p.seq = Math.max(p.seq ?? 0, maxId(p)) + 1)
        const _forget = () => (history.clear(), writers.clear())
        const _purge = (test) => {
                for (const k of [...styles.keys()]) if (test(JSON.parse(k))) styles.delete(k)
                for (const k of [...marks.keys()]) if (test(JSON.parse(k))) marks.delete(k)
        }
        const _rename = (map, name, from, to) => {
                for (const [k, v] of [...map]) {
                        const parts = JSON.parse(k)
                        if (parts[0] !== name || parts[2] !== from) continue
                        map.delete(k)
                        map.set(key(...parts.with(2, to)), v)
                }
        }
        const _cell = (p, row, c) => ({
                text: p.rows.get(row)[p.cols.indexOf(c)],
                marks: [...marks].map(([k, [stop, v]]) => [...JSON.parse(k), stop, v]).filter(([pg, r, cl]) => pg === p.name && r === row && cl === c).map(([, , , a, n, b, v]) => [a, b, n, v]).sort(byJson),
        })
        const _write = (p, row, c, text, ms) => {
                p.rows.get(row)[p.cols.indexOf(c)] = text
                _purge((k) => k.length === 5 && k[0] === p.name && k[1] === row && k[2] === c)
                for (const [a, b, n, v] of _trim(text, ms)) marks.set(key(p.name, row, c, a, n), [b, v])
                return _cell(p, row, c)
        }
        const _record = (id, k, entry) => {
                const h = _hist(id)
                h.undo.push({ key: k, ...entry })
                h.redo.length = 0
                writers.set(k, id)
        }
        const _apply = (e, state) => {
                const parts = JSON.parse(e.key)
                const p = _page(parts[1])
                const before = parts[0] === 'cell' ? _cell(p, parts[2], parts[3]) : styles.get(key(...parts.slice(1))) ?? null
                if (parts[0] === 'cell') return (_write(p, parts[2], parts[3], state.text, state.marks), before)
                if (state === null) styles.delete(key(...parts.slice(1)))
                if (state !== null) styles.set(key(...parts.slice(1)), state)
                return before
        }
        const _shift = (id, from, to, field) => {
                const h = _hist(id)
                const e = h[from].at(-1)
                if (h.poison || (e && writers.get(e.key) !== id)) return { status: 'unknown', changed: false }
                if (!e) return _ok(undefined, false)
                h[from].pop()
                h[to].push(e)
                writers.set(e.key, id)
                const prev = _apply(e, e[field])
                return _ok(undefined, JSON.stringify(prev) !== JSON.stringify(e[field]))
        }
        const _import = (o) => {
                const p = _page(o.page) ?? { name: o.page, cols: [...o.names], rows: new Map() }
                const at = o.names.map((n) => p.cols.indexOf(_col(p, n)))
                if (at.includes(-1)) return _either()
                const created = !pages.includes(p)
                if (created) pages.push(p)
                for (const row of o.rows) p.rows.set(_next(p), p.cols.map((_, i) => row[at.indexOf(i)] ?? null))
                return _ok(undefined, created || o.rows.length > 0)
        }
        const _sql = (o) => {
                const parts = o.text.split(';').map((t) => t.trim()).filter(Boolean)
                if (parts.some((t) => _WRITE.test(t))) return { status: 'reject', changed: false }
                const m = _READ.exec(parts.at(-1) ?? '')
                const p = m && _page(m[2])
                if (!p) return _ok(undefined, false)
                if (m[1] === 'count(*)') return _ok([['count(*)'], [p.rows.size]], false)
                const rows = [...p.rows].filter(([i]) => i >= Number(m[3] ?? 0)).sort((a, b) => a[0] - b[0]).slice(0, Math.min(Number(m[4] ?? 100), 100))
                return _ok([['_id', ...p.cols], ...rows.map(([i, v]) => [i, ...v])], false)
        }
        const _at = (o) => ((p) => ({ p, c: p && _col(p, o.col) }))(_page(o.page))
        const _del = (p, test, result) => (_purge(test), _forget(), _ok(result))
        const _OPS = {
                open: () => _ok(undefined, false),
                save: () => _ok(undefined, false),
                sql: _sql,
                import: _import,
                leave: (o) => (windows.delete(o.id), _ok(undefined, false)),
                undo: (o) => _shift(o.id, 'undo', 'redo', 'before'),
                redo: (o) => _shift(o.id, 'redo', 'undo', 'after'),
                'page.add': (o) => (_page(o.page) ? _either() : (pages.push({ name: o.page, cols: [], rows: new Map() }), _ok())),
                'page.del': (o) => {
                        const { p } = _at(o)
                        if (!p) return _either()
                        pages = pages.filter((q) => q !== p)
                        return _del(p, (k) => k[0] === p.name)
                },
                'row.add': (o) => {
                        const { p } = _at(o)
                        if (!p) return _either()
                        p.rows.set(_next(p), p.cols.map(() => null))
                        return _ok([[p.seq]])
                },
                'row.del': (o) => {
                        const { p } = _at(o)
                        if (!p) return _either()
                        _forget()
                        return p.rows.delete(o.row) ? _del(p, (k) => k[0] === p.name && k[1] === o.row) : _ok(undefined, false)
                },
                'col.add': (o) => {
                        const { p, c } = _at(o)
                        if (!p || c) return _either()
                        p.cols.push(o.col)
                        p.rows.forEach((r) => r.push(null))
                        return _ok()
                },
                'col.del': (o) => {
                        const { p, c } = _at(o)
                        if (!c) return _either()
                        const i = p.cols.indexOf(c)
                        p.cols.splice(i, 1)
                        p.rows.forEach((r) => r.splice(i, 1))
                        return _del(p, (k) => k[0] === p.name && k[2] === c)
                },
                'col.name': (o) => {
                        const { p, c } = _at(o)
                        if (!c || _col(p, o.name)) return _either()
                        p.cols[p.cols.indexOf(c)] = o.name
                        _rename(styles, p.name, c, o.name)
                        _rename(marks, p.name, c, o.name)
                        return _del(p, () => false)
                },
                cell: (o) => {
                        const { p, c } = _at(o)
                        if (!c) return _either()
                        if (!p.rows.has(o.row)) return _poison(o.id)
                        const before = _cell(p, o.row, c)
                        const after = _write(p, o.row, c, o.text, o.marks)
                        _record(o.id, key('cell', p.name, o.row, c), { before, after })
                        return _ok(undefined, JSON.stringify(before) !== JSON.stringify(after))
                },
                style: (o) => {
                        const { p, c } = _at(o)
                        if (!p) return _either()
                        if (!c || (o.row > 0 && !p.rows.has(o.row))) return _poison(o.id)
                        const k = key('style', p.name, o.row, c, o.name)
                        const before = styles.get(key(p.name, o.row, c, o.name)) ?? null
                        _apply({ key: k }, o.value)
                        _record(o.id, k, { before, after: o.value })
                        return _ok(undefined, before !== o.value)
                },
                window: (o) => {
                        const { p } = _at(o)
                        if (!p) return _either()
                        windows.set(o.id, { page: p.name, top: o.top, size: o.size })
                        return _ok(undefined, false)
                },
        }
        const apply = (op) => (isValid(op) ? _OPS[op.type](op) : { status: 'reject', changed: false })
        const view = () => {
                const out = { pages: pages.map((p) => [p.name]) }
                for (const [id, w] of windows) {
                        const p = _page(w.page)
                        if (!p) continue
                        const rows = [...p.rows].filter(([i]) => i >= w.top).sort((a, b) => a[0] - b[0]).slice(0, w.size)
                        const ids = new Set(rows.map(([i]) => i))
                        out[`${id}/cols`] = p.cols.map((c) => [c, styles.get(key(p.name, 0, c, 'width')) ?? '4'])
                        out[`${id}/rows`] = rows.map(([i, v]) => [i, ...v])
                        out[`${id}/styles`] = decor().styles.filter(([pg, r]) => pg === p.name && ids.has(r)).map(([, ...rest]) => rest).sort(byJson)
                        out[`${id}/marks`] = decor().marks.filter(([pg, r]) => pg === p.name && ids.has(r)).map(([, r, c, a, n, b, v]) => [r, c, a, b, n, v]).sort(byJson)
                        out[`${id}/last`] = [[p.rows.size ? maxId(p) : null]]
                }
                return out
        }
        const decor = () => ({
                styles: [...styles].map(([k, v]) => [...JSON.parse(k), v]).sort(byJson),
                marks: [...marks].map(([k, [b, v]]) => [...JSON.parse(k), b, v]).sort(byJson),
        })
        const snapshot = () => structuredClone({ pages, styles, marks })
        const restore = (snap) => {
                ;({ pages, styles, marks } = structuredClone(snap))
                windows.clear()
                _forget()
        }
        const canShift = (id, stack) => {
                const h = history.get(id)
                const e = h?.[stack].at(-1)
                return !!e && !h.poison && writers.get(e.key) === id && !!_page(JSON.parse(e.key)[1])
        }
        const payload = () => pages.reduce((n, p) => n + [...p.rows.values()].reduce((m, r) => m + 8 + r.reduce((b, t) => b + Buffer.byteLength(t ?? ''), 0), 0), 0)
        return { apply, view, decor, snapshot, restore, canShift, payload, pages: () => pages, windows, fresh: (id) => !history.has(id) }
}
