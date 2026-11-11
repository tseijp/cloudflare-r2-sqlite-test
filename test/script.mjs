import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { createRandom } from './random.mjs'
import { createModel, fold, maxId, isValid } from './model.mjs'

const _FILES = ['S&P500株価データ.csv', 'Google Playストアのレビュー.csv', 'ディズニーランドのレビュー.csv', '航空券価格予測/economy.csv', '航空券価格予測/business.csv', '航空券価格予測/Clean_Dataset.csv', 'ビットコインの履歴データセット/BTC-2017min.csv', 'ビットコインの履歴データセット/BTC-2021min.csv', 'ビットコインの履歴データセット/BTC-Hourly.csv', 'ビットコインの履歴データセット/BTC-Daily.csv', 'Yahoo!知恵袋のトピック分類/test.csv', 'Yahoo!知恵袋のトピック分類/train.csv', '電力負荷予測/continuous dataset.csv', '電力負荷予測/weekly pre-dispatch forecast.csv']
const _PAGES = ['p', 'Sheet 1', '売上 2024', 'a"b', "it's", '50%', 'x_y', 'a/b', 'MiXed', 'P'.repeat(64), 'a;b', 'x--y', ' pad ', '絵文字😀', 'a b  c']
const _COLS = ['a', 'b', 'c', 'name', '金額', 'col 2', 'q"q', "o'o", '100%', 'u_v', 'p/q', 'Z'.repeat(64), 'c;d', 'e--f', ' s ', '列😀', '"\'; --']
const _IDS = ['u1', 'u2', 'bob-7', 'A_B', 'c'.repeat(32), 'u3', 'u4', 'u5', 'u6', '0']
const _STYLES = ['fill', 'bold', 'color', 'w-1_x']
const _TEXTS = ['', 'abc', 'こんにちは 世界', 'a"b\'c%d_e/f', '  padded  ', 'line\nbreak', '50% off_/', 'あ'.repeat(1500), 'x'.repeat(4200), 'y'.repeat(4096), 'z'.repeat(4097), 'tab\there', 'bell\u0007x', 'del\u007fx', 'cr\rlf\n', '\u001b[0m esc', 'nel\u0085x', '"q,q"\r\n"r"', 'say "hi"\nbye']
const _BAD = [['page', '_p'], ['page', 'sqlite_x'], ['page', 'rowid'], ['page', ''], ['page', 'y'.repeat(65)], ['page', 'a\u0001b'], ['page', 'a\u0085b'], ['col', 'oid'], ['col', '_c'], ['col', ''], ['col', 'sqlite_master'], ['col', 'W'.repeat(65)], ['col', 'c\u007fd'], ['col', 'c\u009fd'], ['name', 'bad name!'], ['id', 'has space'], ['id', 'i'.repeat(33)], ['row', -1], ['row', 1.5], ['row', '1'], ['size', 0], ['size', 201], ['top', -1], ['text', 5], ['marks', 'x'], ['marks', [[0, 1, 'bad name', 'v']]], ['names', ['a', 'A']], ['rows', [[1]]], ['type', 'nope']]
const _SQL = ['select count(*) from "%"', 'select * from "%"', 'select 1; select count(*) from "%"', 'select * from "%" where "_id" >= # order by "_id" limit 150', 'select count(*), max("_id") from "%"', 'select p."_id" from "%" p join "_style" s on s."row" = p."_id" limit 10', 'with recursive c(n) as (select 1 union all select n + 1 from c where n < 500) select count(*) from c', 'select count(*) from "_style"', 'select * from "_mark" limit 300', 'select name from sqlite_master', 'select 1 from "%" group by "_id" having count(*) > 0 limit 5', 'insert into "%" default values', 'update "%" set "_id" = 1', 'delete from "%"', 'drop table "%"', 'create table zz (x)', 'pragma page_count', "attach ':memory:' as z", 'alter table "%" add column zz text', 'begin', 'vacuum', 'select 1; delete from "%"', 'with w as (select 1) insert into "%" default values', 'with w as (select 1) delete from "_mark"', 'update "_style" set "value" = 1', 'savepoint s1']
const _WEIGHTS = [['cell', 16], ['style', 7], ['row.add', 6], ['col.add', 4], ['window', 6], ['import', 3], ['sql', 5], ['save', 7], ['undo', 3], ['redo', 2], ['row.del', 3], ['col.del', 2], ['col.name', 2], ['page.add', 3], ['page.del', 1.2], ['leave', 2], ['open', 1], ['recreate', 3], ['verify', 2], ['rival', 0.7], ['stale', 0.5], ['invalid', 3], ['burst', 1.5], ['cross', 2], ['fan', 1.5], ['leaveWindow', 1], ['rowDelWindow', 1], ['sameText', 1.5], ['markDup', 0.5], ['rejects', 3], ['importOther', 0.7], ['many', 0.3], ['heavy', 1.5], ['longUndo', 0.5], ['midSql', 1], ['reopen', 0.8], ['churn', 1], ['wide', 0.25], ['fan10', 0.6], ['saves', 1]]
const _MODES = ['mixed', 'every', 'rare', 'none']
const _NAME = { quote: /"/, apos: /'/, semi: /;/, dash: /--/, space: /\s/, ja: /[぀-ヿ一-鿿]/, emoji: /\p{Extended_Pictographic}/u, len1: /^[\s\S]$/, len64: /^[\s\S]{64}$/ }
const [_REJ, _CTRL] = [{ underscore: /^_/, sqlite: /^sqlite_/i, rowid: /^(rowid|oid)$/i, len65: /^[\s\S]{65}$/, ctrl: /[\u0000-\u001f\u007f-\u009f]/, empty: /^$/ }, /[\u0001-\u0009\u000b-\u001f\u007f-\u009f]/]
const _flip = (n) => (typeof n === 'string' ? n.replace(/[a-z]/gi, (ch) => (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase())) : n) // ASCII の大文字小文字を反転した綴り (contract 9 節)
export const BOUNDS = {
        classes: '10 seed ごとに small ×7 (seed % 10 < 7)、medium ×2、large ×1。seed % 40 == 6 は long (small の生成で、作り直し / rival / stale / saves を外し、1 instance で 1,000 命令以上)', modes: 'seed % 4 で save の間隔を変える。mixed (重み 7 で save、save 後 30 〜 70% で作り直し)、every (命令ごとに save)、rare (small は 150 命令ごと、medium / large は最初だけ)、none (save 無し。作り直しで全て失う)',
        steps: { small: [60, 140], medium: [40, 80], large: [20, 40], scale: 'rare の small は ×2.5、every の medium / large は ×0.6' }, bulk: { medium: 'payload が 9 + seed % 5 MiB を超えるまで 8000 行 (2 MiB) の import', large: 'payload が 34 MiB を超えるまで 8000 行 (2 MiB) の import を繰り返し、さらに 10 slice (80000 行) を 1 回。その後 nearLimit' },
        scenes: { case: '命令の page / col / names の ASCII の大文字小文字を 12% で反転 (case.<type>)。sql の table 名も 12% で反転 (case.sql)', churn: '装飾の付いた page を import で作り、列名を 2 〜 4 回変え (b / B / bb / Bb / c)、窓、col.del か row.del、page.del を 2 〜 3 回繰り返す (churn / churn.rename)', wide: '200 列の import、1 MiB の cell、10 人の窓、col.del、sql (wide200 / text.1MiB / clients10)', fan10: '同じ page に 10 人の窓 (clients10)', saves: '(cell, save) × 3 〜 5 の直後に、open の 1 〜 3 回目の get と delete を reject する作り直し (saves.small / fault.openBoth)', burst: '(cell, row.add, save) × 3 〜 5 を障害なしで続ける', cross: '同じ cell に 2 client が cell を書き、undo / redo を 2 〜 4 回交差させる', afterDel: 'row.del / col.del の 60% で、同じ page の消した位置と残った位置に style と cell', rival: "A が先 / B が先 / B が push した後に A が 3 slice の import で merge ('M')", recreate: '障害のあった save の 70%、無い save の 30% で作り直す', fan: '同じ page に 3 〜 5 の id が違う top / size で window', leaveWindow: 'leave の直後に同じ id で window', rowDelWindow: 'row.del の直後に消した行を top にした window', sameText: '今の本文と marks をそのまま再確定', markDup: '同じ (start, name) の mark を 2 つ (主キー違反で reject)', rejects: '同名の page.add / col.add、既にある名前への col.name、無い page / 列への命令の後に undo', colName: '同名への col.name (colName.same) と、その半分 (steps.length % 4 < 2) を大文字小文字だけ違う名前にしたもの (colName.case)', importOther: '既存 page に無い列名での import', getAfterOpen: 'medium / large の作り直し後 50% で、最初の get を reject する全走査の sql と、その次の cell', many: '20 page を足し、窓を登録した page を page.del (pages20 / pageDelWindow)', heavy: '1 cell に 50 区間の marks と style を付け、窓で見てから row.del / col.name / col.del (marks50 / decor.*)', longUndo: '1 人が 30 回 cell を書き (10% で他の人が割り込む)、30 回 undo (途中 30% で row.del)、30 回 redo (long.*)', midSql: 'medium / large で、全走査の sql の 0 〜 3 回目の get を reject し、次に cell と window (fault.midSql / fault.next)', reopen: 'cell と window の後に同じ instance で open を 2 回、window、open (reopen)', nearLimit: 'large の bulk の後に 500 行の import × 20、4200 文字の cell × 15、row.add × 3、col.add、row.del × 2、save (limit.*)', deleteFault: "save の障害の 1/6 は delete を reject (fault.delete)、stale の後の作り直しの 50% は open の delete を reject (fault.openDelete)" },
        names: { pages: _PAGES, cols: _COLS, ids: _IDS, styles: [..._STYLES, 'width'] }, texts: _TEXTS.map((t) => (t.length > 40 ? `${t.slice(0, 8)}… (${t.length} 文字)` : JSON.stringify(t))).concat(['null', 'tok<seed>_<n> (漏れ検査用)', 'M × 1 MiB (wide)']), marks: 'start 0 〜 6、stop は本文 + 2 まで (10% で start = stop)、名前は styles から 0 〜 3 個',
        invalid: _BAD, sql: _SQL, weights: _WEIGHTS, either: 0.08, faults: { kinds: ['reject', 'after', 'null', 'drop'], call: "[0, 3]、save の半分は最初の 'put' (そのうち 1/3 は最初の 'delete')", rate: { save: 0.3, open: 0.3, recreate: 0.3, other: 0.03 } },
        csv: { files: _FILES, slice: 'small は 400 KiB から 5 〜 60 行、bulk は 2 MiB ずつ 8000 行', cell: '2000 文字で切る' }, tags: 'scenes の key は操作列の各 step に付けた tag の到達回数。":faulted" は障害が実際に入った回数。sql.write / sql.read は model の判定、sql.cte / sql.multi / sql.system は文の形',
}

const _read = (path, at, bytes) => ((fd, buf) => ((n) => (closeSync(fd), buf.subarray(0, n).toString('utf8')))(readSync(fd, buf, 0, bytes, at)))(openSync(path, 'r'), Buffer.alloc(bytes))
// fixtures.md 3 節の列名の規則 (BOM と制御文字を除き、`_` を剥がし、空は `列 N`、重複は `名前 (k)`)
const _names = (raw) => raw.reduce((out, n0, i) => {
        let n = (n0.replace(/^﻿/, '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/^_+/, '').trim() || `列 ${i + 1}`).slice(0, 64)
        if (/^(sqlite_|rowid$|oid$)/i.test(n)) n = `列 ${i + 1}`
        for (let k = 2; out.some((x) => fold(x) === fold(n)); k++) n = `${n.slice(0, 58)} (${k})`
        return [...out, n]
}, [])
export const csv = (dir, file, at, bytes, max) => {
        const [path, names] = [`${dir}/${file}`, _names(_read(`${dir}/${file}`, 0, 65536).split('\n')[0].replace(/\r$/, '').split(','))]
        const lines = _read(path, Math.min(at, Math.max(0, statSync(path).size - bytes)), bytes).split('\n').slice(1, -1).map((l) => l.replace(/\r$/, '')).filter((l) => l.length)
        return { names, rows: lines.slice(0, max).map((l) => l.split(',').slice(0, names.length).map((c) => c.slice(0, 2000))) }
}
// 到達回数を数えるための tag。名前と本文の境界は op の中身から、場面は呼び出し側から付ける
const tagsOf = (op, m) => {
        const out = []
        const names = [op.page, op.col, op.type === 'col.name' ? op.name : undefined, ...(Array.isArray(op.names) ? op.names : [])].filter((s) => typeof s === 'string')
        for (const n of names) for (const k in _NAME) if (_NAME[k].test(n)) out.push(`name.${k}`)
        for (const n of names) for (const k in _REJ) if (_REJ[k].test(n)) out.push(`reject.${k}`)
        if (op.type === 'cell') out.push(...[op.text === '' && 'text.empty', op.text === null && 'text.null', typeof op.text === 'string' && Buffer.byteLength(op.text) > 4096 && 'text.over4096', typeof op.text === 'string' && _CTRL.test(op.text) && 'text.ctrl'].filter(Boolean))
        if (op.type === 'sql' && typeof op.text === 'string') out.push(...[m.apply(op).status === 'reject' ? 'sql.write' : 'sql.read', /^with/i.test(op.text) && 'sql.cte', op.text.includes(';') && 'sql.multi', /_style|_mark|sqlite_master/.test(op.text) && 'sql.system', m.pages().some((p) => _flip(p.name) !== p.name && op.text.includes(`"${_flip(p.name).replaceAll('"', '""')}"`)) && 'case.sql'].filter(Boolean))
        if (op.type === 'import' && Array.isArray(op.rows)) out.push(...[!op.rows.length && 'import.empty', op.rows.flat().some((v) => /"/.test(v)) && 'import.quote', op.rows.flat().some((v) => /\n/.test(v)) && 'import.newline'].filter(Boolean))
        if (op.type === 'page.del' && [...m.windows.values()].some((w) => w.page === op.page)) out.push('pageDelWindow')
        if (op.type === 'col.name' && fold(op.col) === fold(op.name)) out.push(op.col === op.name ? 'colName.same' : 'colName.case')
        const ms = Array.isArray(op.marks) ? op.marks.filter(Array.isArray) : []
        out.push(...[ms.some(([, b]) => b > (op.text ?? '').length) && 'mark.stopOver', ms.some(([a, b]) => a === b) && 'mark.startEqStop', new Set(ms.map(([a, , n]) => `${a}/${n}`)).size < ms.length && 'mark.dup'].filter(Boolean))
        const p = op.type === 'window' && m.pages().find((q) => q.name === op.page)
        if (p) out.push(...[op.size === 1 && 'window.size1', op.size === 200 && 'window.size200', op.top === 0 && 'window.top0', op.top > maxId(p) && 'window.topBeyond'].filter(Boolean))
        if (!isValid(op)) out.push('reject.invalid')
        return out
}

export const generate = (seed, dir) => {
        const r = createRandom(seed)
        const m = createModel()
        const [klass, long] = [seed % 10 < 7 ? 'small' : seed % 10 < 9 ? 'medium' : 'large', seed % 40 === 6]
        const mode = _MODES[seed % 4]
        const steps = []
        let tokens = 0
        let saved = m.snapshot()
        const pages = () => m.pages()
        const page = (need) => r.pick(pages().filter((p) => !need || (p.cols.length && p.rows.size))) ?? r.pick(pages())
        const col = (p) => r.pick(p.cols)
        const row = (p) => r.pick([...p.rows.keys()])
        const either = () => r.chance(BOUNDS.either)
        const uniq = (list) => [...new Set(list)]
        const q = (name) => name.replaceAll('"', '""')
        const fresh = (pool, taken) => r.pick(pool.filter((n) => !taken.some((t) => fold(t) === fold(n)))) ?? null
        const upper = (n, c) => (n === c && steps.length % 4 < 2 ? n.toUpperCase() : n) // 同名への col.name の半分を大文字小文字だけ違う名前にする (contract 5 節)。乱数の消費は変えない (every mode は steps.length が常に偶数)
        const text = () => (r.chance(0.15) ? null : r.chance(0.3) ? `tok${seed}_${++tokens} ${r.pick(_TEXTS)}` : r.pick(_TEXTS))
        const marks = (t) => uniq(r.some(_STYLES, 3)).map((n) => ((a) => [a, r.chance(0.1) ? a : r.int(0, Math.max(1, (t ?? '').length + 2)), n, 'v'])(r.int(0, 6)))
        const file = ((fs) => fs[seed % fs.length])(klass === 'large' ? _FILES.filter((f) => statSync(`${dir}/${f}`).size > 2 ** 24) : _FILES) // large は 16 MiB を超える file だけ (上限に届かせる)
        const slice = (k, max, bytes = 409600) => ({ ...csv(dir, file, k * bytes + (seed % 7) * 1000, bytes, max), src: { file, at: k * bytes + (seed % 7) * 1000, bytes, max } })
        const build = {
                'page.add': () => ({ type: 'page.add', page: pages().length && either() ? page().name : fresh(_PAGES, pages().map((p) => p.name)) }),
                'page.del': () => ({ type: 'page.del', page: either() ? 'nope' : page().name }),
                'row.add': () => ({ type: 'row.add', page: either() ? 'nope' : page().name }),
                'row.del': () => ((p) => ({ type: 'row.del', page: p.name, row: either() || !p.rows.size ? 1e6 + r.int(0, 9) : row(p) }))(page(true)),
                'col.add': () => ((p) => ({ type: 'col.add', page: p.name, col: either() && p.cols.length ? col(p).toUpperCase() : fresh(_COLS, p.cols) }))(page()),
                'col.del': () => ((p) => ({ type: 'col.del', page: p.name, col: either() || !p.cols.length ? 'nope' : col(p) }))(page()),
                'col.name': () => ((p) => ((c) => ({ type: 'col.name', page: p.name, col: c, name: either() && p.cols.length ? upper(col(p), c) : fresh(_COLS, p.cols) }))(p.cols.length ? col(p) : 'nope'))(page()),
                cell: () => ((p, t) => ({ type: 'cell', id: r.pick(_IDS), page: p.name, row: either() || !p.rows.size ? 1e6 + r.int(0, 9) : row(p), col: p.cols.length ? col(p) : 'nope', text: t, marks: marks(t) }))(page(true), text()),
                style: () => ((p) => ({ type: 'style', id: r.pick(_IDS), page: p.name, row: r.chance(0.3) || !p.rows.size ? 0 : row(p), col: p.cols.length && !either() ? col(p) : 'nope', name: r.chance(0.4) ? 'width' : r.pick(_STYLES), value: r.chance(0.2) ? null : String(r.int(1, 12)) }))(page(true)),
                window: () => ((p, id) => ({ type: 'window', id, page: either() && !m.windows.has(id) ? 'nope' : p.name, top: r.pick([0, 0, p.rows.size ? row(p) : 0, maxId(p) + 1]), size: r.pick([1, 3, r.int(1, 30), 200]) }))(page(true), r.pick(_IDS)),
                leave: () => ({ type: 'leave', id: r.pick(_IDS) }),
                import: () => {
                        const [p, data] = [r.chance(0.5) && pages().length ? page() : null, r.chance(0.6) ? slice(r.int(0, 50), r.int(5, 60)) : { names: uniq(r.some(_COLS, 4)), rows: Array.from({ length: r.chance(0.15) ? 0 : r.int(1, 30) }, () => Array.from({ length: r.int(0, 5) }, text)) }]
                        if (!p) return { type: 'import', page: fresh(_PAGES, pages().map((q) => q.name)) ?? `csv${steps.length}`, names: data.names.length ? data.names : ['a'], rows: data.rows, src: data.src }
                        return ((names) => ({ type: 'import', page: p.name, names: names.length ? names : [p.cols[0] ?? 'a'], rows: data.rows, src: data.src }))(p.cols.length ? uniq(r.some(p.cols, p.cols.length)) : [])
                },
                undo: () => ({ type: 'undo', id: r.pick(_IDS.filter((i) => m.depth(i, 'undo')).concat(r.pick(_IDS))) }),
                redo: () => ({ type: 'redo', id: r.pick(_IDS.filter((i) => m.depth(i, 'redo')).concat(r.pick(_IDS))) }),
                sql: () => ((p) => ({ type: 'sql', text: r.pick(_SQL).replace('%', q(r.chance(0.12) ? _flip(p.name) : p.name)).replace('#', String(r.int(0, Math.max(1, maxId(p))))) }))(page(true)),
                save: () => ({ type: 'save' }), open: () => ({ type: 'open' }),
                invalid: () => ((op) => (([field, value]) => ({ ...op, [field]: value }))(r.pick(_BAD.filter(([f]) => f in op))))(build[r.pick(['cell', 'style', 'window', 'page.add', 'col.add', 'row.del', 'import', 'col.name'])]()),
        }
        // page / col / names の綴りを 12% で反転する。本文と装飾は同じ位置に当たる (contract 9 節)
        const vary = (op) => ((ks) => [ks.length ? { ...op, ...Object.fromEntries(ks.map((k) => [k, Array.isArray(op[k]) ? op[k].map(_flip) : _flip(op[k])])) } : op, ks.length ? [`case.${op.type}`] : []])(['page', 'col', 'names'].filter((k) => (typeof op[k] === 'string' || Array.isArray(op[k])) && /[a-z]/i.test(String(op[k])) && r.chance(0.12)))
        const push = ({ src: s, ...op0 }, fault, tags = []) => {
                if (Object.values(op0).some((v) => v === undefined)) return
                const [op, cased] = vary(op0)
                const rate = BOUNDS.faults.rate[op.type] ?? BOUNDS.faults.rate.other
                const faults = fault ?? (r.chance(rate) ? [{ call: op.type === 'save' && r.chance(0.5) ? r.pick(['put', 'put', 'delete']) : r.int(0, 3), kind: r.pick(BOUNDS.faults.kinds) }] : [])
                steps.push({ op, faults, tags: [...tags, ...cased, ...tagsOf(op, m), ...(faults.some((f) => f.call === 'delete') ? ['fault.delete'] : [])], src: s })
                if (op.type === 'open') m.restore(saved)
                if (op.type !== 'open') m.apply(op)
                if (op.type === 'save' && !faults.length) saved = m.snapshot()
                if (mode === 'every' && !['save', 'open'].includes(op.type)) push({ type: 'save' }, undefined, ['save.every'])
        }
        const control = (ctl, extra = {}) => {
                const faults = ctl === 'recreate' && r.chance(BOUNDS.faults.rate.recreate) ? [{ call: r.int(0, 3), kind: r.pick(BOUNDS.faults.kinds) }] : []
                steps.push({ ctl, faults, tags: [], ...extra })
                if (ctl === 'recreate' || ctl === 'rival') m.restore(saved)
                if (ctl === 'recreate' && klass !== 'small' && pages().length && r.chance(0.5)) (push({ type: 'sql', text: `select count(*) from "${q(page().name)}"` }, [{ call: 0, kind: 'reject' }], ['fault.getAfterOpen']), push(build.cell(), [], ['fault.next']))
        }
        const big = (k, rows, bytes, times = 1) => ((parts) => ({ type: 'import', page: file.split('/').pop().replace(/\.csv$/, ''), names: parts[0].names, rows: parts.flatMap((x) => x.rows), src: { file, from: k, times, rows, bytes } }))(Array.from({ length: times }, (_, i) => slice(k + i, rows, bytes)))
        const bulk = (k, rows, bytes, times = 1) => push(big(k, rows, bytes, times), [], ['bulk'])
        const after = (op) => {
                const p = pages().find((q) => fold(q.name) === fold(op.page))
                if (!p || !p.cols.length) return
                ;(push({ ...build.style(), page: p.name, row: r.pick([0, op.row ?? 0, ...p.rows.keys()]), col: r.pick([op.col ?? p.cols[0], ...p.cols]) }, undefined, ['afterDel']), push({ ...build.cell(), page: p.name, row: r.pick([op.row ?? 1e6, ...p.rows.keys()]), col: r.pick([op.col ?? p.cols[0], ...p.cols]) }, undefined, ['afterDel']))
        }
        const cross = () => {
                const [base, ids] = [build.cell(), [r.pick(_IDS), r.pick(_IDS)]]
                if (base.row >= 1e6) return
                ;(ids.forEach((id) => push({ ...build.cell(), page: base.page, row: base.row, col: base.col, id }, undefined, ['sameCell'])), Array.from({ length: r.int(2, 4) }, () => push({ type: r.pick(['undo', 'redo']), id: r.pick(ids) }, undefined, ['sameCell'])))
        }
        const fan = () => ((p) => uniq(Array.from({ length: r.int(3, 5) }, () => r.pick(_IDS))).forEach((id) => push({ type: 'window', id, page: p.name, top: r.pick([0, p.rows.size ? row(p) : 0, maxId(p) + 1]), size: r.pick([1, 3, r.int(1, 30), 200]) }, undefined, ['fan'])))(page(true))
        const leaveWindow = () => ((id) => (push({ type: 'leave', id }), push({ ...build.window(), id }, undefined, ['leaveWindow'])))(r.pick(_IDS))
        const rowDelWindow = () => ((p) => ((at) => (push({ type: 'row.del', page: p.name, row: at }), push({ type: 'window', id: r.pick(_IDS), page: p.name, top: at, size: r.pick([1, 5, 200]) }, undefined, ['rowDelWindow'])))(p.rows.size ? row(p) : 1))(page(true))
        const sameText = () => ((p) => p.rows.size && p.cols.length && ((at, c) => push({ type: 'cell', id: r.pick(_IDS), page: p.name, row: at, col: c, ...m.cell(p.name, at, c) }, undefined, ['text.same']))(row(p), col(p)))(page(true))
        const markDup = () => ((op) => op.row < 1e6 && op.marks.length && push({ ...op, marks: [...op.marks, [op.marks[0][0], op.marks[0][1] + 1, op.marks[0][2], 'w']] }))(build.cell())
        const rejects = () => {
                const [p, c] = ((p) => [p, p.cols.length ? col(p) : null])(page())
                const [op, tag] = r.pick([[{ type: 'page.add', page: p.name }, 'reject.dupPage'], [{ type: 'row.add', page: 'nope' }, 'reject.noPage'], [{ ...build.cell(), page: 'nope' }, 'reject.noPage'], [{ type: 'col.del', page: p.name, col: 'nope' }, 'reject.noCol'], [{ type: 'window', id: r.pick(_IDS), page: 'nope', top: 0, size: 5 }, 'reject.noPage'], ...(c ? [[{ type: 'col.add', page: p.name, col: c }, 'reject.dupCol'], [{ ...build.cell(), page: p.name, col: 'nope' }, 'reject.noCol'], [{ type: 'col.name', page: p.name, col: c, name: upper(r.pick(p.cols), c) }, 'reject.colNameTaken']] : [])])
                ;(push(op, undefined, [tag]), ((id) => id && push({ type: 'undo', id }, undefined, ['reject.thenUndo']))(r.pick(_IDS.filter((i) => m.depth(i, 'undo')))))
        }
        const importOther = () => ((p) => push({ type: 'import', page: p.name, names: uniq([fresh(_COLS, p.cols) ?? 'zz', ...r.some(p.cols, 2)]), rows: [[text(), text()], [text()]] }, undefined, ['importOtherNames']))(page())
        const many = () => ((p) => (Array.from({ length: 20 }, (_, k) => (push({ type: 'page.add', page: `m${k}` }, [], ['pages20']), k % 3 === 0 && (push({ type: 'col.add', page: `m${k}`, col: 'a' }, []), push({ type: 'row.add', page: `m${k}` }, [])))), push({ type: 'window', id: r.pick(_IDS), page: p, top: 0, size: 5 }, []), push({ type: 'page.del', page: p })))(`m${r.int(0, 19)}`)
        const heavy = () => {
                const [p, id] = [page(true), r.pick(_IDS)]
                if (!p.rows.size || !p.cols.length) return
                const [at, c] = [row(p), col(p)]
                ;(push({ type: 'cell', id, page: p.name, row: at, col: c, text: `tok${seed}_${++tokens} ${'m'.repeat(60)}`, marks: Array.from({ length: 50 }, (_, i) => [i, i + 1 + r.int(0, 4), _STYLES[i % 4], 'v']) }, [], ['marks50']), push({ type: 'style', id, page: p.name, row: at, col: c, name: 'fill', value: '2' }, []), push({ type: 'window', id, page: p.name, top: at, size: 3 }, []))
                ;((op) => push(op, undefined, [`decor.${op.type}`]))(r.pick([{ type: 'row.del', page: p.name, row: at }, { type: 'col.name', page: p.name, col: c, name: fresh(_COLS, p.cols) ?? c }, { type: 'col.del', page: p.name, col: c }]))
        }
        const longUndo = () => {
                const [p, id, other] = [page(true), r.pick(_IDS), r.pick(_IDS)]
                if (!p.rows.size || !p.cols.length) return
                const cell = (who, tag) => push({ type: 'cell', id: who, page: p.name, row: row(p), col: col(p), text: text(), marks: [] }, [], [tag])
                for (let k = 0; k < 30; k++) (cell(id, 'long.cell'), r.chance(0.1) && cell(other, 'long.other'))
                for (let k = 0; k < 60; k++) (push({ type: k < 30 ? 'undo' : 'redo', id }, [], [k < 30 ? 'long.undo' : 'long.redo']), k === 15 && r.chance(0.3) && push({ type: 'row.del', page: p.name, row: row(p) }, [], ['long.del']))
        }
        const midSql = () => (push({ type: 'sql', text: `select count(*) from "${q(pages()[0].name)}"` }, [{ call: r.int(0, 3), kind: 'reject' }], ['fault.midSql']), push(build.cell(), [], ['fault.next']), push({ ...build.window(), page: page().name }, [], ['fault.next']))
        const reopen = () => (push(build.cell(), [], ['reopen']), push({ ...build.window(), page: page().name }, [], ['reopen']), push({ type: 'open' }, [], ['reopen']), push({ type: 'open' }, [], ['reopen']), pages().length && push(build.window(), [], ['reopen']), push({ type: 'open' }, undefined, ['reopen']))
        const churn = () => {
                const [pg, id, p] = [fresh(_PAGES, pages().map((p) => p.name)) ?? `ch${steps.length}`, r.pick(_IDS), () => pages().find((q) => fold(q.name) === fold(pg))]
                for (let k = r.int(2, 3); k > 0; k--) {
                        ;(push({ type: 'import', page: pg, names: ['a', 'b'], rows: [['x', 'y'], ['z', null]] }, [], ['churn']), push({ type: 'style', id, page: pg, row: row(p()), col: 'a', name: 'fill', value: '3' }, [], ['churn']), push({ type: 'cell', id, page: pg, row: row(p()), col: 'b', text: 'churn', marks: [[0, 3, 'bold', 'v']] }, [], ['churn']), push({ type: 'style', id, page: pg, row: 0, col: 'b', name: 'width', value: '7' }, [], ['churn']))
                        for (let j = r.int(2, 4), c = 'b'; j > 0; j--) ((n) => (fold(n) === fold(c) || !p().cols.some((x) => fold(x) === fold(n))) && (push({ type: 'col.name', page: pg, col: c, name: n }, [], ['churn.rename']), (c = n)))(r.pick(['b', 'B', 'bb', 'Bb', 'c']))
                        ;(push({ type: 'window', id, page: pg, top: 0, size: 5 }, [], ['churn']), push(r.pick([{ type: 'col.del', page: pg, col: 'a' }, { type: 'row.del', page: pg, row: row(p()) }]), [], ['churn']), push({ type: 'page.del', page: pg }, [], ['churn']))
                }
        }
        const wide = () => {
                const [pg, names] = [`wide${steps.length}`, Array.from({ length: 200 }, (_, i) => `c${i}`)]
                ;(push({ type: 'import', page: pg, names, rows: Array.from({ length: 3 }, (_, k) => names.map((_, i) => (i % 50 === k ? `v${i}` : null))) }, [], ['wide200']), push({ type: 'cell', id: 'u1', page: pg, row: 2, col: 'c199', text: `tok${seed}_${++tokens} ${'M'.repeat(2 ** 20)}`, marks: [[0, 5, 'bold', 'v']] }, [], ['text.1MiB']))
                ;(push({ type: 'style', id: 'u2', page: pg, row: 0, col: 'c150', name: 'width', value: '9' }, [], ['wide200']), _IDS.forEach((id) => push({ type: 'window', id, page: pg, top: 0, size: 3 }, [], ['clients10'])))
                ;(push({ type: 'col.del', page: pg, col: 'c100' }, [], ['wide200']), push({ type: 'sql', text: `select count(*) from "${pg}"` }, [], ['wide200']))
        }
        const fan10 = () => ((p) => _IDS.forEach((id) => push({ type: 'window', id, page: p.name, top: r.pick([0, p.rows.size ? row(p) : 0]), size: r.pick([1, 3, 30, 200]) }, undefined, ['clients10'])))(page(true))
        const saves = () => {
                for (let k = r.int(3, 5); k > 0; k--) (push(build.cell(), []), push({ type: 'save' }, [], ['saves.small']))
                control('recreate', { faults: [{ call: r.int(1, 3), kind: 'reject' }, { call: 'delete', kind: 'reject' }], tags: ['fault.openBoth'] })
        }
        const nearLimit = () => {
                const p = pages()[0]
                for (let k = 0; k < 38; k++) push(k < 20 ? big(70 + k, 500, 2 ** 17) : k < 35 ? { type: 'cell', id: 'u1', page: p.name, row: row(p), col: col(p), text: `tok${seed}_${++tokens} ${'x'.repeat(4200)}`, marks: [] } : { type: 'row.add', page: p.name }, [], [k < 20 ? 'limit.fill' : k < 35 ? 'limit.cell' : 'limit.row'])
                ;(push({ type: 'col.add', page: p.name, col: fresh(_COLS, p.cols) ?? 'zz' }, [], ['limit.col']), push({ type: 'row.del', page: p.name, row: row(p) }, [], ['limit.del']), push({ type: 'row.del', page: p.name, row: row(p) }, [], ['limit.del']), push({ type: 'save' }, [], ['limit.save']))
        }
        for (let k = 0; klass === 'medium' && k < 60 && m.payload() < (9 + (seed % 5)) * 2 ** 20; k++) bulk(k, 8000, 2 ** 21)
        for (let k = 0; klass === 'large' && k < 60 && m.payload() < 34 * 2 ** 20; k++) bulk(k, 8000, 2 ** 21)
        if (klass === 'large') (bulk(60, 8000, 2 ** 21, 10), nearLimit())
        if (!pages().length) push({ type: 'page.add', page: 'p' }, [])
        if (!pages()[0].cols.length) push({ type: 'col.add', page: pages()[0].name, col: 'a' }, [])
        if (mode !== 'none' && klass !== 'small') push({ type: 'save' }, [], ['save.first'])
        const weights = _WEIGHTS.filter(([k]) => (mode === 'mixed' || !['save', 'burst'].includes(k)) && (klass !== 'small' || k !== 'midSql') && (!long || !['recreate', 'rival', 'stale', 'saves'].includes(k)))
        const [lo, hi] = BOUNDS.steps[klass].map((n) => Math.round(n * (mode === 'rare' && klass === 'small' ? 2.5 : mode === 'every' && klass !== 'small' ? 0.6 : 1)))
        const scenes = { cross, fan, leaveWindow, rowDelWindow, sameText, markDup, rejects, importOther, many, heavy, longUndo, midSql, reopen, churn, wide, fan10, saves }
        for (let n = r.int(lo, hi); n > 0 || (long && steps.length <= 1000); n--) {
                if (!pages().length) push({ type: 'page.add', page: 'p' }, [])
                if (mode === 'rare' && n % 150 === 0) push({ type: 'save' }, undefined, ['save.rare'])
                const kind = r.weighted(weights)
                if (kind === 'rival') ((first) => (({ src, ...b } = {}) => control('rival', { first, big: first === 'M' ? { ...b, page: `big${steps.length}` } : undefined, src }))(first === 'M' ? big(r.int(0, 20), 8000, 2 ** 21, 3) : undefined))(r.pick(['A', 'B', 'M']))
                else if (kind === 'stale') (control('stale'), control('recreate', r.chance(0.5) ? { faults: [{ call: 'delete', kind: 'reject' }], tags: ['fault.openDelete'] } : {}))
                else if (kind === 'recreate' || kind === 'verify') control(kind)
                else if (kind === 'burst') for (let k = r.int(3, 5); k > 0; k--) (push(build.cell()), push(build['row.add']()), push({ type: 'save' }, []))
                else if (kind in scenes) scenes[kind]()
                else push(build[kind]())
                if (['row.del', 'col.del'].includes(kind) && r.chance(0.6)) after(steps.at(-1).op)
                if (steps.at(-1)?.op?.type === 'save' && mode === 'mixed' && !long && r.chance(steps.at(-1).faults.length ? 0.7 : 0.3)) control('recreate')
        }
        ;(steps[0].tags.push(`save.${mode}`), long && steps[1000]?.tags.push('steps1000'))
        return { seed, klass, mode, file, steps }
}
