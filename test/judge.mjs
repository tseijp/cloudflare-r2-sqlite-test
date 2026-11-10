import { isValid, byJson, maxId } from './model.mjs'
import { CHUNK, PAGE, LIMIT, SWAP, SLOTS, ROWS, decodeStore } from './codec.mjs'

const _CODES = ['pull', 'open', 'sql', 'read', 'view', 'refresh', 'drop', 'fill', 'set', 'undo', 'redo', 'forget', 'push', 'merge']
const _TEXT = { sql: 1, read: 1, view: 2, fill: 2 }
const _json = (v) => JSON.stringify(v)
const _eq = (a, b) => _json(a) === _json(b)
const _canon = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)))
const _range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i)
const _q = (name) => `"${name.replaceAll('"', '""')}"`
const _bytes = (s) => (s === null ? 0 : Buffer.byteLength(s))
const _strings = (op) => [op.type === 'sql' ? null : op.text, op.value, ...(op.marks ?? []).map((m) => m?.[3]), ...(op.rows ?? []).flat()].filter((s) => typeof s === 'string' && s.length >= 6 && !(op.names ?? []).includes(s)).slice(0, 50)
const _diff = (want, got) => {
        const at = want.findIndex((w, i) => !_eq(w, got[i]))
        return { length: [want.length, got.length], at, expected: want[at], observed: got[at] }
}
export const attempt = (f) => new Promise((res) => res(f())).then((value) => ({ ok: true, value }), (error) => ({ ok: false, error: String(error?.message ?? error) }))
export const merges = (s) => s.base <= CHUNK || s.patch + s.dirty >= CHUNK || (s.deltas * (s.deltas + 1)) / 2 >= 1 + (2 * s.pages) / SWAP

export const createJudge = ({ store, model }) => {
        const verdicts = []
        const failures = []
        let index = -1
        let api = null
        const record = (axis, what, ok, expected, observed) => {
                verdicts.push({ axis, what, ok })
                if (!ok) failures.push({ index, axis, what, expected, observed })
                return ok
        }
        const rows = (p) => [...p.rows].sort((a, b) => a[0] - b[0]).map(([i, v]) => [i, ...v])
        const plan = (s) => (s.dirty === 0 ? [] : merges(s) ? [['merge']] : [['push']])
        const compiled = async (op, stat) => {
                const a = await attempt(() => api.db.compile(op, stat))
                const b = await attempt(() => api.db.compile({ ...op, zz: 1 }, stat))
                if (!isValid(op)) return record('compile', 'invalid throws', !a.ok, 'throw', a.ok ? _json(a.value).slice(0, 300) : a.error)
                if (!record('compile', 'pure', a.ok && b.ok && _eq(a.value, b.value), 'same codes twice, extra field dropped', a.ok ? (b.ok ? 'differs' : b.error) : a.error)) return
                record('compile', 'codes', a.value.every((c) => Array.isArray(c) && _CODES.includes(c[0])), _CODES, a.value.map((c) => c[0]))
                const text = a.value.filter((c) => c[0] in _TEXT).map((c) => c[_TEXT[c[0]]]).join('\n')
                const leaks = _strings(op).filter((s) => text.includes(s))
                record('compile', 'params', !leaks.length, 'user text only in params', leaks)
                if (op.type === 'save') record('compile', 'save plan', _eq(a.value, plan(stat)), plan(stat), a.value)
        }
        const openCalls = (d) => {
                const out = [['get', 0, 0, CHUNK * PAGE]]
                if (d.base <= CHUNK) return out
                for (let k = 1; k <= d.deltas + 1; k++) out.push(['get', k, 0, null])
                if (d.garbage.includes(d.deltas + 1)) out.push(['delete', _range(d.deltas + 1, SLOTS)])
                return out
        }
        const saveCalls = (s, d, state) => {
                const out = state.failedPut === null ? [] : [['get', state.failedPut, 0, 1]]
                if (state.diverged || s.dirty === 0) return out
                if (d.garbage.length) out.push(['delete', d.garbage])
                if (!merges(s)) return [...out, ['put', s.deltas + 1, '*', '']]
                if (s.base > CHUNK) out.push(['get', 0, 0, '*'])
                out.push(['put', 0, '*', state.tag])
                return s.deltas > 0 ? [...out, ['delete', _range(1, s.deltas)]] : out
        }
        const same = (a, e) => a[0] === e[0] && (e[0] === 'delete' ? e[1].every((q) => a[1].includes(q)) : e.slice(1).every((v, i) => v === '*' || v === a[i + 1]))
        const match = (sig, exp, prelude) => {
                const act = prelude && sig[0]?.[0] === 'get' && sig[0][3] === 1 && exp[0]?.[3] !== 1 ? sig.slice(1) : sig
                return act.length === exp.length && act.every((a, i) => same(a, exp[i]))
        }
        const calls = (op, list, s, d, state) => {
                const sig = list.map((c) => [c.kind, ...c.args])
                const k = list.findIndex((c) => c.fault)
                const cut = (exp) => (k < 0 ? exp : exp.slice(0, Math.min(k + 1, exp.length)))
                if (op.type === 'save' && state.touched) record('回数', 'dirty', s.dirty > 0, 'dirty > 0 after a change', s.dirty)
                if (op.type === 'open') return record('回数', 'open', match(sig, cut(openCalls(d)), false), cut(openCalls(d)), sig)
                if (op.type === 'save') return record('回数', 'save', match(sig, cut(saveCalls(s, d, state)), state.prelude), cut(saveCalls(s, d, state)), sig)
                const reads = list.every((c) => c.kind === 'get' && c.args[0] === 0 && d.chunks.some(([o, l]) => o === c.args[1] && l === c.args[2]))
                record('回数', 'read', reads && (d.base > CHUNK || !list.length), d.base > CHUNK ? 'chunk range GET only' : 'no store call', sig)
        }
        const chain = (op, res, s, dBefore, dAfter, faulted) => {
                const seqs = [...store.objects.keys()].sort((a, b) => a - b)
                record('鎖', 'slots', Math.max(0, ...seqs) <= SLOTS && dAfter.ok, `image + delta ≤ ${SLOTS}, decodable`, { seqs, ok: dAfter.ok })
                if (op.type === 'save' && res.ok && !faulted && s.dirty > 0 && merges(s)) record('鎖', 'merged', !seqs.some((q) => q >= 1 && q <= s.deltas), 'no delta after merge', seqs)
                const cleanup = (op.type === 'save' && res.ok && !faulted) || (op.type === 'open' && res.ok && !faulted && dBefore.base > CHUNK)
                if (cleanup && dBefore.garbage.length) record('鎖', 'leftover', !dAfter.garbage.length, 'leftover deleted', dAfter.garbage)
        }
        const limit = (op, res, s, payload) => {
                record('上限', 'pages', s.pages <= LIMIT, `≤ ${LIMIT}`, s.pages)
                if (op.type === 'save' && res.ok && s.base > CHUNK) record('上限', 'patch+dirty', s.patch + s.dirty < CHUNK, `< ${CHUNK}`, s.patch + s.dirty)
                if (op.type === 'import' && payload > LIMIT * PAGE) record('上限', 'over', !res.ok, 'reject beyond LIMIT', res.ok ? 'resolved' : res.error)
                if (op.type === 'import' && !res.ok && /full/i.test(res.error)) record('上限', 'full', payload >= 12 * 2 ** 20, 'full only near LIMIT', payload)
        }
        const view = () => {
                const actual = {}
                for (const [k, v] of api.doc.getMap('view')) {
                        const at = k.lastIndexOf('/')
                        ;(actual[k.slice(0, at)] ??= []).push([Number(k.slice(at + 1)), v])
                }
                for (const g in actual) actual[g] = actual[g].sort((a, b) => a[0] - b[0]).every(([i], n) => i === n) ? actual[g].map(([, v]) => v) : 'sparse keys'
                for (const g in actual) if (/\/(styles|marks)$/.test(g) && Array.isArray(actual[g])) actual[g] = actual[g].filter((r) => r[0] !== 0).sort(byJson)
                const want = model.view()
                for (const g in want) if (!want[g].length) delete want[g]
                for (const g in actual) if (Array.isArray(actual[g]) && !actual[g].length) delete actual[g]
                record('窓', 'view', _eq(_canon(want), _canon(actual)), want, actual)
        }
        const content = async (axisTable, axisDecor) => {
                const names = await api.run({ type: 'sql', text: "select name from sqlite_master where type = 'table' order by rowid" })
                const expectNames = ['_style', '_mark', ...model.pages().map((p) => p.name)]
                const got = names.ok ? names.value.slice(1).flat().filter((n) => !n.startsWith('sqlite_')) : names.error
                if (!record(axisTable, 'tables', names.ok && _eq(got, expectNames), expectNames, got)) return
                for (const p of model.pages()) {
                        if (p.rows.size > 20000 && index % 8 !== 0) continue
                        const sums = p.cols.map((c) => `, total(octet_length(${_q(c)}))`).join('')
                        const r = await api.run({ type: 'sql', text: `select count(*), coalesce(max("_id"), 0), total("_id")${sums} from ${_q(p.name)}` })
                        const h = await api.run({ type: 'sql', text: `select * from ${_q(p.name)} where "_id" < 0` })
                        const want = [[p.rows.size, maxId(p), [...p.rows.keys()].reduce((a, b) => a + b, 0), ...p.cols.map((_, i) => [...p.rows.values()].reduce((a, v) => a + _bytes(v[i]), 0))], ['_id', ...p.cols]]
                        record(axisTable, 'rows', r.ok && h.ok && _eq([r.value[1], h.value[0]], want), want, r.ok && h.ok ? [r.value[1], h.value[0]] : r.error ?? h.error)
                }
                const { styles, marks } = model.decor()
                const s = await api.run({ type: 'sql', text: 'select count(*), total("row"), total(octet_length("page")), total(octet_length("col")), total(octet_length("name")), total(octet_length("value")) from "_style"' })
                const wantS = [styles.length, ...[1, 0, 2, 3, 4].map((i) => styles.reduce((a, r) => a + (i === 1 ? r[i] : _bytes(r[i])), 0))]
                record(axisDecor, 'styles', s.ok && _eq(s.value[1], wantS), wantS, s.ok ? s.value[1] : s.error)
                const m = await api.run({ type: 'sql', text: 'select count(*), total("row"), total("start"), total("stop"), total(octet_length("col")), total(octet_length("value")) from "_mark"' })
                const wantM = [marks.length, ...[1, 3, 5, 2, 6].map((i) => marks.reduce((a, r) => a + (i < 6 && i !== 2 ? r[i] : _bytes(r[i])), 0))]
                record(axisDecor, 'marks', m.ok && _eq(m.value[1], wantM), wantM, m.ok ? m.value[1] : m.error)
        }
        const page = async (text, offset) => {
                const out = []
                for (let more = true, k = 0; more; k++) {
                        const r = await api.run({ type: 'sql', text: text(offset ? k * ROWS : out.at(-1)?.[0] ?? -1) })
                        if (!r.ok) return { error: r.error }
                        out.push(...r.value.slice(1))
                        out.header ??= r.value[0]
                        more = r.value.length - 1 === ROWS
                }
                return out
        }
        const full = async (axisTable, axisDecor) => {
                for (const p of model.pages()) {
                        const got = await page((last) => `select * from ${_q(p.name)} where "_id" > ${last} order by "_id" limit ${ROWS}`)
                        const want = rows(p)
                        record(axisTable, 'full rows', !got.error && _eq(got.header, ['_id', ...p.cols]) && _eq(got, want), p.name, got.error ?? _diff(want, got))
                }
                const { styles, marks } = model.decor()
                const s = await page((k) => `select * from "_style" order by "page", "row", "col", "name" limit ${ROWS} offset ${k}`, true)
                record(axisDecor, 'full styles', !s.error && _eq([...s].sort(byJson), styles), '_style', s.error ?? _diff(styles, [...s].sort(byJson)))
                const m = await page((k) => `select * from "_mark" order by "page", "row", "col", "start", "name" limit ${ROWS} offset ${k}`, true)
                record(axisDecor, 'full marks', !m.error && _eq([...m].sort(byJson), marks), '_mark', m.error ?? _diff(marks, [...m].sort(byJson)))
        }
        const reopen = async (oracle, axis) => {
                const d = await attempt(() => decodeStore(store.objects, true))
                if (!record(axis, 'decode', d.ok && d.value.ok, 'store decodes per contract 4', d.ok ? d.value.ok : d.error)) return
                const s = api.db.stat()
                record('回数', 'stat', s.base === d.value.base && s.deltas === d.value.deltas && s.patch === d.value.patch && (!d.value.file || s.pages === d.value.pages), { base: d.value.base, deltas: d.value.deltas, patch: d.value.patch, pages: d.value.file ? d.value.pages : '*' }, s)
                if (!d.value.file) return record(axis, 'store empty', !model.pages().length, 'no page', model.pages().map((p) => p.name))
                const o = await oracle.inspect(d.value.file)
                record('原子', 'integrity', o.integrity === 'ok', 'ok', o.integrity)
                const tables = ['_style', '_mark', ...model.pages().map((p) => p.name)]
                record(axis, 'store tables', _eq(o.tables.filter((n) => !n.startsWith('sqlite_')), tables), tables, o.tables)
                for (const p of model.pages()) record(axis, 'store rows', !!o.dump[p.name] && _eq(o.dump[p.name].cols, ['_id', ...p.cols]) && _eq(o.dump[p.name].rows, rows(p)), p.name, o.dump[p.name] ? _diff(rows(p), o.dump[p.name].rows) : 'missing')
                const { styles, marks } = model.decor()
                record(axis, 'store styles', _eq([...(o.dump._style?.rows ?? [])].sort(byJson), styles), '_style', _diff(styles, [...(o.dump._style?.rows ?? [])].sort(byJson)))
                record(axis, 'store marks', _eq([...(o.dump._mark?.rows ?? [])].sort(byJson), marks), '_mark', _diff(marks, [...(o.dump._mark?.rows ?? [])].sort(byJson)))
        }
        const step = async ({ op, expect, res, calls: list, before, after, state, dBefore, dAfter, payload }) => {
                const faulted = list.some((c) => c.fault)
                if (!faulted && expect.status === 'ok') record('compile', 'accept', res.ok, 'resolve', res.error)
                if (expect.status === 'reject') record('compile', 'reject', !res.ok, 'reject', res.ok ? 'resolved' : res.error)
                if (expect.status === 'ok' && expect.result !== undefined && res.ok) record(op.type === 'sql' ? '履歴' : 'compile', 'result', _eq(res.value, expect.result), expect.result, res.value)
                if (op.type === 'sql' && res.ok) record('履歴', 'rows', Array.isArray(res.value) && res.value.length - 1 <= ROWS, `≤ ${ROWS}`, Array.isArray(res.value) ? res.value.length - 1 : res.value)
                if (!res.hang) await compiled(op, before)
                calls(op, list, before, dBefore, state)
                chain(op, res, before, dBefore, dAfter, faulted)
                limit(op, res, after, payload)
                if (res.hang || res.dropped || (op.type === 'open' && !res.ok)) return
                view()
                const axis = op.type === 'undo' || op.type === 'redo' ? '履歴' : null
                await content(axis ?? '窓', axis ?? '装飾')
        }
        return { verdicts, failures, record, step, full, reopen, at: (i) => (index = i), use: (a) => (api = a) }
}
