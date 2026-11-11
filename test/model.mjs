const _CTRL = /[\u0000-\u001f\u007f-\u009f]/
// 書き込みを含む文。先頭の CTE (`with … )`) の後に書き込みが続く形も拒む
const _WRITE = /^\s*(?:with\b[\s\S]*?\)\s*)?(insert|update|delete|create|drop|alter|replace|pragma|attach|detach|begin|commit|rollback|vacuum|reindex|savepoint|release)\b/i
const _READ = /^select (count\(\*\)|\*|count\(\*\), max\("_id"\)) from "([^"]+)"(?: where "_id" >= (\d+) order by "_id" limit (\d+))?$/
const _CTE = /^with recursive c\(n\) as \(select 1 union all select n \+ 1 from c where n < (\d+)\) select count\(\*\) from c$/
const _tables = (text) => [...text.matchAll(/(?:from|join) "((?:[^"]|"")+)"/gi)].map((x) => x[1].replaceAll('""', '"')) // 文が参照する table (識別子で囲まれたもの)

export const fold = (s) => String(s).replace(/[A-Z]/g, (c) => c.toLowerCase())
export const key = (...parts) => JSON.stringify(parts)
export const byJson = (a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)
export const maxId = (p) => { let m = 0; for (const k of p.rows.keys()) if (k > m) m = k; return m }
const _isName = (s) => typeof s === 'string' && s.length >= 1 && s.length <= 64 && !s.startsWith('_') && !fold(s).startsWith('sqlite_') && !['rowid', 'oid'].includes(fold(s)) && !_CTRL.test(s)
const _isId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(s)
const _isInt = (n, min, max = Infinity) => Number.isInteger(n) && n >= min && n <= max
const _isText = (s) => s === null || typeof s === 'string'
const _isMark = (m) => Array.isArray(m) && _isInt(m[0], 0) && _isInt(m[1], 0) && _isId(m[2]) && typeof m[3] === 'string'
const _isNames = (ns) => Array.isArray(ns) && ns.length > 0 && ns.every(_isName) && new Set(ns.map(fold)).size === ns.length
const _isRows = (rows) => Array.isArray(rows) && rows.every((r) => Array.isArray(r) && r.every(_isText))
// contract 5 節の field の制約。style の name は sname、sql の text は query として検査する
const _IS = { page: _isName, col: _isName, name: _isName, id: _isId, sname: _isId, row: (n) => _isInt(n, 0), top: (n) => _isInt(n, 0), size: (n) => _isInt(n, 1, 200), text: _isText, value: _isText, marks: (m) => Array.isArray(m) && m.every(_isMark), names: _isNames, rows: _isRows, query: (s) => typeof s === 'string' }
const _FIELDS = { open: [], save: [], undo: ['id'], redo: ['id'], leave: ['id'], 'page.add': ['page'], 'page.del': ['page'], 'row.add': ['page'], 'row.del': ['page', 'row'], 'col.add': ['page', 'col'], 'col.del': ['page', 'col'], 'col.name': ['page', 'col', 'name'], cell: ['id', 'page', 'row', 'col', 'text', 'marks'], style: ['id', 'page', 'row', 'col', 'sname', 'value'], window: ['id', 'page', 'top', 'size'], import: ['page', 'names', 'rows'], sql: ['query'] }
export const isValid = (op) => !!(op && _FIELDS[op.type]?.every((f) => _IS[f](op[{ sname: 'name', query: 'text' }[f] ?? f])))
const _trim = (text, marks) => marks.map(([a, b, n, v]) => [a, Math.min(b, (text ?? '').length), n, v]).filter(([a, b]) => a < b)
const _no = () => ({ status: 'reject', changed: false })
const _ok = (result, changed = true) => ({ status: 'ok', changed, result })

export const createModel = () => {
        let pages = []
        let styles = new Map()
        let marks = new Map()
        const [windows, chains, stacks, stats, stuck] = [new Map(), new Map(), new Map(), { crossed: 0 }, new Set()] // stuck: page.del の綴りと違う綴りで登録された窓の id (製品に登録が残り、以後の refresh が失敗する。報告 006)
        const _page = (name) => pages.find((p) => fold(p.name) === fold(name))
        const _col = (p, name) => p.cols.find((c) => fold(c) === fold(name))
        const _stack = (id) => stacks.get(id) ?? stacks.set(id, { undo: [], redo: [], poison: false }).get(id)
        const _poison = (id) => ((_stack(id).poison = true), _ok(undefined, false))
        const [_next, _forget] = [(p) => (p.seq = (p.seq ?? maxId(p)) + 1), () => (chains.clear(), stacks.clear())]
        const _purge = (test) => [styles, marks].forEach((map) => [...map.keys()].filter((k) => test(JSON.parse(k))).forEach((k) => map.delete(k)))
        // 装飾の key は page と col を fold した位置 (contract 9 節の COLLATE NOCASE)、値の先頭 2 つは行に入った綴り。col.name は綴りを新しい名前にする
        const _rename = (map, pf, cf, to) => [...map].forEach(([k, v]) => ((parts) => parts[0] === pf && parts[2] === cf && (map.delete(k), map.set(key(...parts.with(2, fold(to))), v.with(1, to))))(JSON.parse(k)))
        const _sk = (pg, row, c, name) => key(fold(pg), row, fold(c), name)
        const _put = (sk, pg, c, value) => styles.set(sk, [...(styles.get(sk)?.slice(0, 2) ?? [pg, c]), value]) // 既にある key は綴りを保って値だけ変わる (upsert)
        const _cell = (p, row, c) => ({ text: p.rows.get(row)[p.cols.indexOf(c)], marks: [...marks].map(([k, [, , stop, v]]) => [...JSON.parse(k), stop, v]).filter(([pg, r, cl]) => pg === fold(p.name) && r === row && cl === fold(c)).map(([, , , a, n, b, v]) => [a, b, n, v]).sort(byJson) })
        const _write = (p, row, c, text, ms, [spg, sc]) => {
                ;(p.rows.get(row)[p.cols.indexOf(c)] = text), _purge((k) => k.length === 5 && k[0] === fold(p.name) && k[1] === row && k[2] === fold(c))
                return (_trim(text, ms).forEach(([a, b, n, v]) => marks.set(key(fold(p.name), row, fold(c), a, n), [spg, sc, b, v])), _cell(p, row, c))
        }
        // 編集の履歴の key は渡された綴り (contract 9 節)。undo / redo はその綴りで命令を流し直す
        const _apply = (k, state) => {
                const [kind, pg, row, c, name] = JSON.parse(k)
                const p = _page(pg)
                if (kind === 'cell') return ((before) => (_write(p, row, _col(p, c), state.text, state.marks, [pg, c]), before))(_cell(p, row, _col(p, c)))
                const sk = _sk(pg, row, c, name)
                return ((before) => (state === null ? styles.delete(sk) : _put(sk, pg, c, state), before))(styles.get(sk)?.[2] ?? null)
        }
        // edit map の key ごとの item の鎖と、client ごとの undo / redo stack を yjs の UndoManager の規則で持つ
        const _chain = (k) => chains.get(k) ?? chains.set(k, []).get(k)
        const _follow = (it) => (it.redone ? _follow(it.redone) : it)
        const _append = (k, item) => ((left) => (_chain(k).push(item), left && !left.deleted ? ((left.deleted = true), [left]) : []))(_chain(k).at(-1))
        const _set = (id, k, before, value) => {
                if (_chain(k).at(-1)?.deleted !== false) _append(k, { value: before, deleted: false, redone: null })
                ;((item) => (_stack(id).undo.push({ key: k, dels: _append(k, item), ins: [item] }), (_stack(id).redo.length = 0)))({ value, deleted: false, redone: null })
        }
        const _redo = (c, e, s, out) => {
                if (c.redone) return c.redone
                const ch = _chain(e.key)
                const kept = (it) => it.redone || e.ins.includes(it) || [...s.undo, ...s.redo].some((x) => x.dels.includes(it))
                let i = ch.indexOf(c)
                for (; i + 1 < ch.length && kept(ch[i + 1]); i = ch.indexOf(_follow(ch[i + 1])));
                if (i + 1 < ch.length) return (stats.crossed++, null)
                const copy = (c.redone = { value: c.value, deleted: false, redone: null })
                return (out.dels.push(..._append(e.key, copy)), out.ins.push(copy), copy)
        }
        const _shift = (id, from, to) => {
                const s = _stack(id)
                if (s.poison) return { status: 'unknown', changed: false }
                for (let e = s[from].pop(); e; e = s[from].pop()) {
                        const out = { key: e.key, dels: [], ins: [] }
                        const gone = e.ins.map(_follow).filter((it) => !it.deleted)
                        const did = e.dels.map((c) => _redo(c, e, s, out) !== null).includes(true) || gone.length > 0
                        for (const it of gone) (it.deleted || out.dels.push(it), (it.deleted = true))
                        if (!did) continue
                        if (out.dels.length || out.ins.length) s[to].push(out)
                        return ((value) => ({ ..._ok(undefined, JSON.stringify(_apply(e.key, value)) !== JSON.stringify(value)), touch: JSON.parse(e.key) }))(_chain(e.key).at(-1).value)
                }
                return _ok(undefined, false)
        }
        // undo / redo が触れた key の今の値 (cell は本文、style は値、無ければ null)
        const valueOf = ([kind, pg, row, c, name]) => ((p) => (kind === 'cell' ? p?.rows.get(row)?.[p.cols.indexOf(_col(p, c))] ?? null : styles.get(_sk(pg, row, c, name))?.[2] ?? null))(_page(pg))
        const _import = (o) => {
                const p = _page(o.page) ?? { name: o.page, cols: [...o.names], rows: new Map() }
                const at = o.names.map((n) => p.cols.indexOf(_col(p, n)))
                if (at.includes(-1)) return _no()
                const created = !pages.includes(p) && !!pages.push(p)
                for (const row of o.rows) p.rows.set(_next(p), p.cols.map((_, i) => row[at.indexOf(i)] ?? null))
                return _ok(undefined, created || o.rows.length > 0)
        }
        const _sql = (o) => {
                const parts = o.text.split(';').map((t) => t.trim()).filter(Boolean)
                if (parts.some((t) => _WRITE.test(t)) || _tables(o.text).some((t) => !/^_(style|mark)$/.test(t) && !_page(t))) return _no() // 無い table を参照する文は SQL の error で reject
                const [m, c] = [_READ.exec(parts.at(-1) ?? ''), _CTE.exec(parts.at(-1) ?? '')]
                if (c) return _ok([['count(*)'], [Number(c[1])]], false)
                if (m && m[1] === 'count(*)' && /^_(style|mark)$/.test(m[2])) return _ok([['count(*)'], [decor()[`${m[2].slice(1)}s`].length]], false)
                const p = m && _page(m[2])
                if (!p) return _ok(undefined, false)
                if (m[1] === 'count(*)') return _ok([['count(*)'], [p.rows.size]], false)
                if (m[1] !== '*') return _ok([['count(*)', 'max("_id")'], [p.rows.size, p.rows.size ? maxId(p) : null]], false)
                return _ok([['_id', ...p.cols], ...[...p.rows].filter(([i]) => i >= Number(m[3] ?? 0)).sort((a, b) => a[0] - b[0]).slice(0, Math.min(Number(m[4] ?? 100), 100)).map(([i, v]) => [i, ...v])], false)
        }
        const _at = (o) => ((p) => ({ p, c: p && _col(p, o.col) }))(_page(o.page))
        const _del = (p, test, changed = true) => (_purge(test), _forget(), _ok(undefined, changed))
        // 位置が無いとき、名前が重なるときの結果は contract 5 節の表。page.del はその page を見ていた全員の窓の登録も消す (同じ表)
        const _OPS = {
                open: () => _ok(undefined, false), save: () => _ok(undefined, false), sql: _sql, import: _import,
                leave: (o) => (windows.delete(o.id), stuck.delete(o.id), _ok(undefined, false)),
                undo: (o) => _shift(o.id, 'undo', 'redo'),
                redo: (o) => _shift(o.id, 'redo', 'undo'),
                'page.add': (o) => (_page(o.page) ? _no() : (pages.push({ name: o.page, cols: [], rows: new Map() }), _ok())),
                'page.del': (o) => ((p) => (p ? ((pages = pages.filter((q) => q !== p)), [...windows].forEach(([id, w]) => w.page === p.name && (windows.delete(id), w.spelled !== o.page && stuck.add(id))), _del(p, (k) => k[0] === fold(p.name))) : _no()))(_page(o.page)),
                'row.add': (o) => ((p) => (p ? (p.rows.set(_next(p), p.cols.map(() => null)), _ok([[p.seq]])) : _no()))(_page(o.page)),
                'row.del': (o) => ((p) => (p ? (_forget(), p.rows.delete(o.row) ? _del(p, (k) => k[0] === fold(p.name) && k[1] === o.row) : _ok(undefined, false)) : _no()))(_page(o.page)),
                'col.add': (o) => (({ p, c }) => (!p || c ? _no() : (p.cols.push(o.col), p.rows.forEach((r) => r.push(null)), _ok())))(_at(o)),
                'col.del': (o) => (({ p, c }) => (!c ? _no() : ((i) => (p.cols.splice(i, 1), p.rows.forEach((r) => r.splice(i, 1)), _del(p, (k) => k[0] === fold(p.name) && k[2] === fold(c))))(p.cols.indexOf(c))))(_at(o)),
                // 自分と同じ名前への col.name も解決し、schema の page が汚れ (changed)、全員の履歴を捨てる (contract 5 節)
                'col.name': (o) => (({ p, c }) => (!c || (_col(p, o.name) && _col(p, o.name) !== c) ? _no() : ((p.cols[p.cols.indexOf(c)] = o.name), _rename(styles, fold(p.name), fold(c), o.name), _rename(marks, fold(p.name), fold(c), o.name), _del(p, () => false))))(_at(o)),
                cell: (o) => {
                        const { p, c } = _at(o)
                        if (!c) return _no()
                        if (!p.rows.has(o.row)) return _poison(o.id)
                        if (new Set(_trim(o.text, o.marks).map(([a, , n]) => `${a}/${n}`)).size < _trim(o.text, o.marks).length) return _no() // 切り詰めた後に同じ (start, name) が 2 つあると _mark の主キー (contract 9 節) に入らないので、transaction ごと reject (contract 5 節)
                        return ((before, after) => (_set(o.id, key('cell', o.page, o.row, o.col), before, after), _ok(undefined, JSON.stringify(before) !== JSON.stringify(after))))(_cell(p, o.row, c), _write(p, o.row, c, o.text, o.marks, [o.page, o.col]))
                },
                style: (o) => {
                        const { p, c } = _at(o)
                        if (!p) return o.value === null ? _poison(o.id) : _no()
                        if (!c || (o.row > 0 && !p.rows.has(o.row))) return _poison(o.id)
                        const [k, before] = [key('style', o.page, o.row, o.col, o.name), styles.get(_sk(o.page, o.row, o.col, o.name))?.[2] ?? null]
                        return (_apply(k, o.value), _set(o.id, k, before, o.value), _ok(undefined, before !== o.value))
                },
                // contract 7 節: page が無ければ最初の rows で失敗し、登録も tree も変わらない
                window: (o) => ((p) => (p ? (windows.set(o.id, { page: p.name, spelled: o.page, top: o.top, size: o.size }), stuck.delete(o.id), _ok(undefined, false)) : _no()))(_page(o.page)),
        }
        const apply = (op) => (isValid(op) ? _OPS[op.type](op) : _no())
        const view = () => {
                const out = { pages: pages.map((p) => [p.name]) }
                for (const [id, w] of windows) {
                        const p = _page(w.page)
                        if (!p) continue
                        const rows = [...p.rows].filter(([i]) => i >= w.top).sort((a, b) => a[0] - b[0]).slice(0, w.size)
                        const ids = new Set(rows.map(([i]) => i))
                        ;(out[`${id}/cols`] = p.cols.map((c) => [c, styles.get(_sk(p.name, 0, c, 'width'))?.[2] ?? '4'])), (out[`${id}/rows`] = rows.map(([i, v]) => [i, ...v])), (out[`${id}/last`] = [[p.rows.size ? maxId(p) : null]])
                        ;(out[`${id}/styles`] = decor().styles.filter(([pg, r]) => fold(pg) === fold(p.name) && ids.has(r)).map(([, ...rest]) => rest).sort(byJson)), (out[`${id}/marks`] = decor().marks.filter(([pg, r]) => fold(pg) === fold(p.name) && ids.has(r)).map(([, r, c, a, n, b, v]) => [r, c, a, b, n, v]).sort(byJson))
                }
                return out
        }
        // _style は [page, row, col, name, value]、_mark は [page, row, col, start, name, stop, value]。page と col は行に入った綴り
        const decor = () => ({ styles: [...styles].map(([k, [pg, c, v]]) => ((ps) => [pg, ps[1], c, ps[3], v])(JSON.parse(k))).sort(byJson), marks: [...marks].map(([k, [pg, c, b, v]]) => ((ps) => [pg, ps[1], c, ps[3], ps[4], b, v])(JSON.parse(k))).sort(byJson) })
        const snapshot = () => structuredClone({ pages, styles, marks })
        const restore = (snap) => (({ pages, styles, marks } = structuredClone(snap)), windows.clear(), stuck.clear(), _forget())
        const canShift = (id) => !stacks.get(id)?.poison
        const depth = (id, stack) => (canShift(id) && stacks.get(id)?.[stack].length) || 0
        const payload = () => pages.reduce((n, p) => n + [...p.rows.values()].reduce((m, r) => m + 8 + r.reduce((b, t) => b + Buffer.byteLength(t ?? ''), 0), 0), 0)
        return { apply, view, decor, snapshot, restore, canShift, depth, payload, valueOf, cell: (pg, row, c) => _cell(_page(pg), row, c), pages: () => pages, windows, stats, stuck }
}
