import { isValid, byJson, maxId } from './model.mjs'
import { CHUNK, PAGE, LIMIT, SWAP, SLOTS, ROWS, decodeStore } from './codec.mjs'

const _CODES = ['pull', 'open', 'sql', 'read', 'view', 'refresh', 'drop', 'fill', 'set', 'undo', 'redo', 'forget', 'push', 'merge']
const _TEXT = { sql: 1, read: 1, view: 2, fill: 2 }
const _ORDER = { _style: '"page", "row", "col", "name"', _mark: '"page", "row", "col", "start", "name"' }
const [_IO, _json, _eq] = [/disk I\/O error/, (v) => JSON.stringify(v), (a, b) => JSON.stringify(a) === JSON.stringify(b)]
const _canon = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)))
const _range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i)
const [_q, _s] = [(name) => `"${name.replaceAll('"', '""')}"`, (text) => `'${text.replaceAll("'", "''")}'`]
const _bytes = (s) => (s === null ? 0 : Buffer.byteLength(s))
// 利用者の値 (本文、装飾の値、取込の行)。名前 (識別子として文に入る) の一部と同じ文字列は漏れの検査から外す
const _strings = (op) => ((names) => [op.type === 'sql' ? null : op.text, op.value, ...(op.marks ?? []).map((m) => m?.[3]), ...(op.rows ?? []).flat()].filter((s) => typeof s === 'string' && s.length >= 6 && !names.some((n) => n.includes(s))).slice(0, 50))([op.page, op.col, op.name, ...(op.names ?? [])].filter((n) => typeof n === 'string'))
const _diff = (want, got) => ((at) => ({ length: [want.length, got.length], at, expected: want[at], observed: got[at] }))(want.findIndex((w, i) => !_eq(w, got[i])))
// 装飾の指紋。octet_length は大文字小文字に盲目なので、UTF-8 の hex に現れる 6 と 7 の桁数 (小文字 ASCII の上位 nibble) を足す
const [_fp, _fpv] = [(c) => `total(octet_length(${c}) * 16 + length(hex(${c})) - length(replace(replace(hex(${c}), '6', ''), '7', '')))`, (s) => (s === null ? 0 : _bytes(s) * 16 + Buffer.from(s).toString('hex').replace(/[^67]/g, '').length)]
const _sum = (rows, i, text) => rows.reduce((a, r) => a + (text ? _fpv(r[i]) : r[i]), 0)
export const attempt = (f) => new Promise((res) => res(f())).then((value) => ({ ok: true, value }), (error) => ({ ok: false, error: String(error?.message ?? error) }))
export const merges = (s) => s.base <= CHUNK || s.patch + s.dirty >= CHUNK || (s.deltas * (s.deltas + 1)) / 2 >= 1 + (2 * s.pages) / SWAP

export const createJudge = ({ store, model }) => {
        const verdicts = []
        const failures = []
        let [index, api, mutated, probing] = [-1, null, false, false]
        // image の put が書いた後に reject した後は、open し直すまで memory に無い chunk の読みが disk I/O error で失敗してよい (contract 3 節、issue 003)。その error は判定しない
        const record = (axis, what, ok, expected, observed, known) => {
                if (api.state?.ioerr && typeof observed === 'string' && _IO.test(observed)) return true
                ;(verdicts.push({ axis, what, ok, known }), ok || failures.push({ index, axis, what, expected, observed, known }))
                return (mutated && (api.mutated?.(axis, what, ok), (mutated = false)), ok)
        }
        // 判定に渡す直前の観測を 1 か所だけ変える hook (依頼 1)。変えたら直後の record が崩れを報告するかを数える
        const seen = (kind, value) => (probing ? value : ((v) => ((mutated = v !== undefined), v ?? value))(api.mutate?.(kind, value)))
        const rows = (p) => [...p.rows].sort((a, b) => a[0] - b[0]).map(([i, v]) => [i, ...v])
        const plan = (s) => (s.dirty === 0 ? [] : merges(s) ? [['merge']] : [['push']])
        const compiled = async (op, stat) => {
                const [a, b] = seen('pure', [await attempt(() => api.db.compile(op, stat)), await attempt(() => api.db.compile({ ...op, zz: 1 }, stat))])
                if (!isValid(op)) return record('compile', 'invalid throws', !seen('throws', a.ok), 'throw', a.ok ? _json(a.value).slice(0, 300) : a.error)
                if (!record('compile', 'pure', a.ok && b.ok && _eq(a.value, b.value), 'same codes twice, extra field dropped', a.ok ? (b.ok ? 'differs' : b.error) : a.error)) return
                const codes = seen('codes', a.value)
                record('compile', 'codes', codes.every((c) => Array.isArray(c) && _CODES.includes(c[0])), _CODES, codes.map((c) => c[0]))
                const { text, strings } = seen('params', { text: a.value.filter((c) => c[0] in _TEXT).map((c) => c[_TEXT[c[0]]]).join('\n'), strings: _strings(op) })
                record('compile', 'params', !strings.some((s) => text.includes(s)), 'user text only in params', strings.filter((s) => text.includes(s)))
                if (op.type === 'save') ((got) => record('compile', 'save plan', _eq(got, plan(stat)), plan(stat), got))(seen('plan', a.value))
        }
        const openCalls = (d) => (d.base <= CHUNK ? [['get', 0, 0, CHUNK * PAGE]] : [['get', 0, 0, CHUNK * PAGE], ..._range(1, d.deltas + 1).map((k) => ['get', k, 0, null]), ...(d.garbage.includes(d.deltas + 1) ? [['delete', _range(d.deltas + 1, SLOTS)]] : [])])
        // contract 3 節: put が reject した番号の確認と、残った delta の delete は save の最初で、image の get より前。dirty が 0 の save は store を呼ばない
        const saveCalls = (s, d, state) => {
                const out = state.failedPut === null ? [] : [['get', state.failedPut, 0, 1]]
                if (state.diverged || s.dirty === 0) return out
                if (d.garbage.length || state.redelete) out.push(['delete', d.garbage]) // 前の delete が失敗していれば、残った delta の有無に依らず最初にもう 1 回 delete する
                if (!merges(s)) return [...out, ['put', s.deltas + 1, '*', '']]
                if (s.base > CHUNK) out.push(['get', 0, 0, '*'])
                if (s.base > CHUNK && d.tag !== state.tag) return out // get(0) の tag が覚えている tag と違えば image changed で reject し、put は呼ばない
                return [...out, ['put', 0, '*', state.tag], ...(s.base > CHUNK ? [['delete', _range(1, SLOTS)]] : [])] // image が 2 chunk 以上なら delta の数に依らず 1 〜 SLOTS を消す
        }
        const same = (a, e) => a[0] === e[0] && (e[0] === 'delete' ? Array.isArray(a[1]) && e[1].every((q) => a[1].includes(q)) : e.slice(1).every((v, i) => v === '*' || v === a[i + 1]))
        const match = (sig, exp, prelude) => ((act) => act.length === exp.length && act.every((a, i) => same(a, exp[i])))(prelude && sig[0]?.[0] === 'get' && sig[0][3] === 1 && exp[0]?.[3] !== 1 ? sig.slice(1) : sig)
        const calls = (op, list, s, d, state, expect) => {
                const sig = (kind) => seen(kind, list.map((c) => [c.kind, ...c.args]))
                const k = list.findIndex((c) => c.fault)
                const cut = (exp) => (k < 0 ? exp : exp.slice(0, Math.min(k + 1, exp.length)))
                if (op.type === 'save' && state.touched) ((dirty) => record('回数', 'dirty', dirty > 0, 'dirty > 0 after a change', dirty))(seen('dirty', s.dirty))
                if (op.type === 'save' && !state.touched && !state.maybe && state.failedPut === null) ((g) => record('回数', 'clean', !g.length, 'no store call without a change', { dirty: s.dirty, sig: g }, state.rolled ? '004' : undefined))(sig('sig')) // rollback された書き込みの後の put は issue 004 の形
                if (op.type === 'save' && state.failedPut === null && expect.status !== 'reject' && !expect.rival) ((t) => record('回数', 'stat', t.base === d.base && t.deltas === d.deltas && t.patch === d.patch && t.pages >= d.pages, { base: d.base, deltas: d.deltas, patch: d.patch, pages: `>= ${d.pages}` }, t))(seen('stat', s))
                if (op.type === 'open') return ((g) => record('回数', 'open', match(g, cut(openCalls(d)), false), cut(openCalls(d)), g))(sig('sig'))
                if (op.type === 'save') return ((g) => record('回数', 'save', match(g, cut(saveCalls(s, d, state)), state.prelude), cut(saveCalls(s, d, state)), g))(sig('sig'))
                const g = sig('reads')
                const reads = g.every((c) => c[0] === 'get' && c[1] === 0 && (state.ioerr || d.chunks.some(([o, l]) => o === c[2] && l === c[3])))
                record('回数', 'read', reads && (d.base > CHUNK || !g.length), d.base > CHUNK ? 'chunk range GET only' : 'no store call', g)
        }
        const chain = (op, res, s, dBefore, dAfter, faulted) => {
                ;(({ seqs, ok }) => record('鎖', 'slots', Math.max(0, ...seqs) <= SLOTS && ok, `image + delta ≤ ${SLOTS}, decodable`, { seqs, ok }))(seen('slots', { seqs: [...store.objects.keys()].sort((a, b) => a - b), ok: dAfter.ok }))
                if (op.type === 'save' && res.ok && !faulted && s.dirty > 0 && s.base > CHUNK && merges(s)) ((m) => record('鎖', 'merged', !m.some((q) => q >= 1 && q <= SLOTS), 'no delta after merge', m))(seen('merged', [...store.objects.keys()]))
                const cleanup = (op.type === 'save' && res.ok && !faulted && s.dirty > 0) || (op.type === 'open' && res.ok && !faulted && dBefore.base > CHUNK) // delete の失敗で残った delta は、次に store を呼ぶ save か open で消える (contract 3 節)
                if (cleanup && dBefore.garbage.length) ((g) => record('鎖', 'leftover', !g.length, 'leftover deleted', g))(seen('leftover', dAfter.garbage))
        }
        const limit = (op, res, s, payload, d) => {
                ;((p) => record('上限', 'pages', p.stat <= LIMIT && p.store <= LIMIT, `≤ ${LIMIT}`, p))(seen('pages', { stat: s.pages, store: d.pages }))
                if (op.type === 'save' && res.ok && s.base > CHUNK) ((n) => record('上限', 'patch+dirty', n < CHUNK, `< ${CHUNK}`, n))(seen('patch', s.patch + s.dirty))
                if (op.type === 'import' && payload > LIMIT * PAGE) ((ok) => record('上限', 'over', !ok, 'reject beyond LIMIT', ok ? 'resolved' : res.error))(seen('over', res.ok))
                if (!res.ok && /full/i.test(res.error)) ((n) => record('上限', 'full', n >= 12 * 2 ** 20, 'full only near LIMIT', n))(seen('full', payload))
        }
        const view = () => {
                const actual = {}
                for (const [k, v] of api.doc.getMap('view')) ((at) => (actual[k.slice(0, at)] ??= []).push([Number(k.slice(at + 1)), v]))(k.lastIndexOf('/'))
                for (const g in actual) actual[g] = actual[g].sort((a, b) => a[0] - b[0]).every(([i], n) => i === n) ? actual[g].map(([, v]) => v) : 'sparse keys'
                for (const g in actual) if (/\/(styles|marks)$/.test(g) && Array.isArray(actual[g])) actual[g] = actual[g].filter((r) => r[0] !== 0).sort(byJson)
                for (const g in actual) if (model.windows.get(g.slice(0, g.lastIndexOf('/')))?.unknown) delete actual[g] // 障害で途中まで登録された window は次の window / leave まで見ない
                const [want, got] = [model.view(), seen('view', actual)]
                for (const o of [want, got]) for (const g in o) if (Array.isArray(o[g]) && !o[g].length) delete o[g]
                record('窓', 'view', _eq(_canon(want), _canon(got)), want, got, model.stuck.size ? '006' : undefined)
        }
        const page = async (text, offset) => {
                const out = []
                for (let r = { value: [, ...Array(ROWS)] }, k = 0; r.value.length - 1 === ROWS; k++) {
                        if (!(r = await api.run({ type: 'sql', text: text(offset ? k * ROWS : out.at(-1)?.[0] ?? -1) })).ok) return { error: r.error }
                        ;(out.push(...r.value.slice(1)), (out.header ??= r.value[0]))
                }
                return out
        }
        // 2 × ROWS 行までの table は全行を比べ、それより大きい table は count と合計の指紋で比べる
        const table = async (rec, axis, what, name, want, header, sums) => {
                if (want.length > 2 * ROWS) {
                        const [r, h] = [await api.run({ type: 'sql', text: sums.text }), await api.run({ type: 'sql', text: `select * from ${_q(name)} where 0` })]
                        const got = r.ok && h.ok ? seen(`${what} fp`, [r.value[1], h.value[0]]) : r.error ?? h.error
                        return rec(axis, what, r.ok && h.ok && _eq(got, sums.want), sums.want, got)
                }
                const got = await page((k) => `select * from ${_q(name)} order by ${_ORDER[name] ?? '"_id"'} limit ${ROWS} offset ${k}`, true)
                const rows = got.error ? got : seen(what, _ORDER[name] ? [...got].sort(byJson) : [...got])
                return rec(axis, what, !got.error && _eq(got.header, header) && _eq(rows, want), want.length > 20 ? `${want.length} rows` : want, got.error ?? _diff(want, rows))
        }
        const content = async (axisTable, axisDecor, rec = record, all = false) => {
                const names = await api.run({ type: 'sql', text: "select name from sqlite_master where type = 'table' order by rowid" })
                const expectNames = ['_style', '_mark', ...model.pages().map((p) => p.name)]
                const got = names.ok ? names.value.slice(1).flat().filter((n) => !n.startsWith('sqlite_')) : names.error
                if (!rec(axisTable, 'tables', names.ok && _eq(got, expectNames), expectNames, got)) return
                for (const p of model.pages()) {
                        if (p.rows.size > 20000 && index % 8 !== 0 && !all) continue
                        const vals = [...p.rows.values()]
                        const want = [[p.rows.size, maxId(p), [...p.rows.keys()].reduce((a, b) => a + b, 0), ...p.cols.flatMap((_, i) => [vals.reduce((a, v) => a + _bytes(v[i]), 0), vals.reduce((a, v) => a + (v[i] === null ? 0 : [...v[i]].length), 0)])], ['_id', ...p.cols]]
                        await table(rec, axisTable, 'rows', p.name, rows(p), ['_id', ...p.cols], { text: `select count(*), coalesce(max("_id"), 0), total("_id")${p.cols.map((c) => `, total(octet_length(${_q(c)})), total(length(${_q(c)}))`).join('')} from ${_q(p.name)}`, want })
                }
                const { styles, marks } = model.decor()
                await table(rec, axisDecor, 'styles', '_style', styles, ['page', 'row', 'col', 'name', 'value'], { text: `select count(*), total("row"), ${['"page"', '"col"', '"name"', '"value"'].map(_fp).join(', ')} from "_style"`, want: [[styles.length, ...[1, 0, 2, 3, 4].map((i) => _sum(styles, i, i !== 1))], ['page', 'row', 'col', 'name', 'value']] })
                await table(rec, axisDecor, 'marks', '_mark', marks, ['page', 'row', 'col', 'start', 'name', 'stop', 'value'], { text: `select count(*), total("row"), total("start"), total("stop"), ${['"page"', '"col"', '"name"', '"value"'].map(_fp).join(', ')} from "_mark"`, want: [[marks.length, ...[1, 3, 5, 0, 2, 4, 6].map((i) => _sum(marks, i, i === 0 || i === 2 || i === 4 || i === 6))], ['page', 'row', 'col', 'start', 'name', 'stop', 'value']] })
        }
        // 判定せずに「SQL の内容が model と一致するか」だけを返す。障害で reject した書き込みが commit 済みかを見分けるのに使う
        const probe = async () => ((r) => ((probing = true), content(null, null, (a, w, ok) => ((r.ok &&= ok), ok), true).then(() => ((probing = false), r.ok))))({ ok: true })
        const full = async (axisTable, axisDecor) => {
                for (const p of model.pages()) ((got, want) => record(axisTable, 'full rows', !got.error && _eq(got.header, ['_id', ...p.cols]) && _eq(got, want), p.name, got.error ?? _diff(want, got)))(await page((last) => `select * from ${_q(p.name)} where "_id" > ${last} order by "_id" limit ${ROWS}`), rows(p))
                const { styles, marks } = model.decor()
                for (const [what, name, want] of [['full styles', '_style', styles], ['full marks', '_mark', marks]]) ((s) => record(axisDecor, what, !s.error && _eq([...s].sort(byJson), want), name, s.error ?? _diff(want, [...s].sort(byJson))))(await page((k) => `select * from ${_q(name)} order by ${_ORDER[name]} limit ${ROWS} offset ${k}`, true))
        }
        const reopen = async (oracle, axis) => {
                const d = await attempt(() => decodeStore(store.objects, true))
                if (!record(axis, 'decode', d.ok && d.value.ok, 'store decodes per contract 4', d.ok ? d.value.ok : d.error)) return
                ;((s) => record('回数', 'stat', s.base === d.value.base && s.deltas === d.value.deltas && s.patch === d.value.patch && (!d.value.file || s.pages === d.value.pages), { base: d.value.base, deltas: d.value.deltas, patch: d.value.patch, pages: d.value.file ? d.value.pages : '*' }, s))(seen('stat', api.db.stat()))
                if (!d.value.file) return record(axis, 'store empty', !model.pages().length, 'no page', model.pages().map((p) => p.name))
                const o = await oracle.inspect(d.value.file)
                record('原子', 'integrity', o.integrity === 'ok', 'ok', o.integrity)
                const tables = ['_style', '_mark', ...model.pages().map((p) => p.name)]
                record(axis, 'store tables', _eq(o.tables.filter((n) => !n.startsWith('sqlite_')), tables), tables, o.tables)
                for (const p of model.pages()) record(axis, 'store rows', !!o.dump[p.name] && _eq(o.dump[p.name].cols, ['_id', ...p.cols]) && _eq(o.dump[p.name].rows, rows(p)), p.name, o.dump[p.name] ? _diff(rows(p), o.dump[p.name].rows) : 'missing')
                const { styles, marks } = model.decor()
                for (const [what, name, want] of [['store styles', '_style', styles], ['store marks', '_mark', marks]]) ((got) => record(axis, what, _eq(got, want), name, _diff(want, got)))(seen(what, [...(o.dump[name]?.rows ?? [])].sort(byJson)))
        }
        // undo / redo が触れた key の値を SQL から直接読む (table が大きくて指紋になるときも、戻った値そのものを比べる)
        const touched = async ([kind, pg, row, c, name]) => {
                const [r, want] = [await api.run({ type: 'sql', text: kind === 'cell' ? `select ${_q(c)} from ${_q(pg)} where "_id" = ${row}` : `select "value" from "_style" where "page" = ${_s(pg)} and "row" = ${row} and "col" = ${_s(c)} and "name" = ${_s(name)}` }), model.valueOf([kind, pg, row, c, name])]
                record('履歴', 'touched', r.ok && _eq(seen('touched', r.value[1]?.[0] ?? null), want), want, r.ok ? r.value[1]?.[0] ?? null : r.error)
        }
        const step = async ({ op, expect, res, calls: list, before, after, state, dBefore, dAfter, payload }) => {
                const faulted = list.some((c) => c.fault)
                const put = list.find((c) => c.kind === 'put')
                // merge の put が成功した後の delete が失敗しても、その save は成功として解決する (contract 3 節)
                if ((!faulted || (put?.wrote && !put.fault && !res.dropped)) && expect.status === 'ok') record('compile', 'accept', seen('accept', res.ok), 'resolve', res.error, model.stuck.size && /no such table/.test(res.error ?? '') ? '006' : undefined) // 別綴りの窓が page.del の後に残り、refresh が失敗する形 (006)
                if (expect.status === 'reject') record('compile', 'reject', !seen('reject', res.ok), 'reject', res.ok ? 'resolved' : res.error, expect.known)
                if (expect.status === 'ok' && expect.result !== undefined && res.ok) ((v) => record(op.type === 'sql' ? '履歴' : 'compile', 'result', _eq(v, expect.result), expect.result, v))(seen('result', res.value))
                if (op.type === 'sql' && res.ok) record('履歴', 'rows', Array.isArray(res.value) && res.value.length - 1 <= ROWS, `≤ ${ROWS}`, Array.isArray(res.value) ? res.value.length - 1 : res.value)
                if (!res.hang) await compiled(op, before)
                ;(calls(op, list, before, dBefore, state, expect), chain(op, res, before, dBefore, dAfter, faulted), limit(op, res, after, payload, dAfter))
                if (res.hang || res.dropped || (op.type === 'open' && !res.ok) || api.state.blind) return
                if (!(expect.status === 'faulted' && expect.changed)) view() // commit の後の refresh が失敗した命令の view は、次に成功した refresh まで古いままでよい (contract 7 節)
                const axis = op.type === 'undo' || op.type === 'redo' ? '履歴' : null
                if (expect.touch && res.ok) await touched(expect.touch)
                await content(axis ?? '窓', axis ?? '装飾')
        }
        return { verdicts, failures, record, seen, step, full, reopen, probe, at: (i) => (index = i), use: (a) => (api = a) }
}
