import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { createRandom } from './random.mjs'
import { createModel, fold, maxId } from './model.mjs'

const _FILES = ['S&P500株価データ.csv', 'Google Playストアのレビュー.csv', 'ディズニーランドのレビュー.csv', '航空券価格予測/economy.csv', '航空券価格予測/business.csv', '航空券価格予測/Clean_Dataset.csv', 'ビットコインの履歴データセット/BTC-2017min.csv', 'ビットコインの履歴データセット/BTC-2021min.csv', 'ビットコインの履歴データセット/BTC-Hourly.csv', 'ビットコインの履歴データセット/BTC-Daily.csv', 'Yahoo!知恵袋のトピック分類/test.csv', 'Yahoo!知恵袋のトピック分類/train.csv', '電力負荷予測/continuous dataset.csv', '電力負荷予測/weekly pre-dispatch forecast.csv']
const _PAGES = ['p', 'Sheet 1', '売上 2024', 'a"b', "it's", '50%', 'x_y', 'a/b', 'MiXed', 'P'.repeat(64)]
const _COLS = ['a', 'b', 'c', 'name', '金額', 'col 2', 'q"q', "o'o", '100%', 'u_v', 'p/q', 'Z'.repeat(64)]
const _IDS = ['u1', 'u2', 'bob-7', 'A_B', 'c'.repeat(32)]
const _STYLES = ['fill', 'bold', 'color', 'w-1_x']
const _TEXTS = ['', 'abc', 'こんにちは 世界', 'a"b\'c%d_e/f', '  padded  ', 'line\nbreak', '50% off_/', 'あ'.repeat(1500), 'x'.repeat(4200)]
const _BAD = [['page', '_p'], ['page', 'sqlite_x'], ['page', 'rowid'], ['page', ''], ['page', 'y'.repeat(65)], ['page', 'a\u0001b'], ['col', 'oid'], ['col', '_c'], ['name', 'bad name!'], ['id', 'has space'], ['id', 'i'.repeat(33)], ['row', -1], ['row', 1.5], ['row', '1'], ['size', 0], ['size', 201], ['top', -1], ['text', 5], ['marks', 'x'], ['marks', [[0, 1, 'bad name', 'v']]], ['names', ['a', 'A']], ['rows', [[1]]], ['type', 'nope']]
const _SQL = ['select count(*) from "%"', 'select * from "%"', 'select 1; select count(*) from "%"', 'select * from "%" where "_id" >= # order by "_id" limit 150', 'insert into "%" default values', 'update "%" set "_id" = 1', 'delete from "%"', 'drop table "%"', 'create table zz (x)', 'pragma page_count', 'attach \':memory:\' as z', 'alter table "%" add column zz text', 'begin']
const _WEIGHTS = [['cell', 18], ['style', 8], ['row.add', 7], ['col.add', 4], ['window', 7], ['import', 3], ['sql', 5], ['save', 7], ['undo', 3], ['redo', 2], ['row.del', 3], ['col.del', 2], ['col.name', 2], ['page.add', 3], ['page.del', 1], ['leave', 2], ['open', 1], ['recreate', 3], ['verify', 2], ['rival', 0.7], ['stale', 0.5], ['invalid', 4]]
export const BOUNDS = {
        classes: '10 seed ごとに small ×7 (seed % 10 < 7)、medium ×2、large ×1',
        steps: { small: [60, 140], medium: [40, 80], large: [20, 40] },
        bulk: { medium: 'payload が 3 + seed % 5 MiB を超えるまで 2000 行 (400 KiB) の import', large: 'payload が 34 MiB を超えるまで 8000 行 (2 MiB) の import を繰り返し、さらに 1 回' },
        names: { pages: _PAGES, cols: _COLS, ids: _IDS, styles: [..._STYLES, 'width'] },
        texts: _TEXTS.map((t) => (t.length > 40 ? `${t.slice(0, 8)}… (${t.length} 文字)` : t)).concat(['null', 'tok<seed>_<n> (漏れ検査用)']),
        invalid: _BAD,
        sql: _SQL,
        weights: _WEIGHTS,
        faults: { kinds: ['reject', 'after', 'null', 'drop'], call: [0, 3], rate: { save: 0.3, open: 0.3, recreate: 0.3, other: 0.03 } },
        either: 0.08,
        csv: { files: _FILES, slice: 'small は 64 KiB から 5 〜 60 行、bulk は 400 KiB ずつ 2000 行', cell: '2000 文字で切る' },
}

const _read = (path, at, bytes) => {
        const fd = openSync(path, 'r')
        const buf = Buffer.alloc(bytes)
        const n = readSync(fd, buf, 0, bytes, at)
        closeSync(fd)
        return buf.subarray(0, n).toString('utf8')
}
const _names = (raw) => {
        const out = []
        for (const [i, n0] of raw.entries()) {
                let n = (n0.replace(/^﻿/, '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/^_+/, '').trim() || `列 ${i + 1}`).slice(0, 64)
                if (/^(sqlite_|rowid$|oid$)/i.test(n)) n = `列 ${i + 1}`
                for (let k = 2; out.some((x) => fold(x) === fold(n)); k++) n = `${n.slice(0, 58)} (${k})`
                out.push(n)
        }
        return out
}
export const csv = (dir, file, at, bytes, max) => {
        const path = `${dir}/${file}`
        const size = statSync(path).size
        const start = Math.min(at, Math.max(0, size - bytes))
        const names = _names(_read(path, 0, 65536).split('\n')[0].replace(/\r$/, '').split(','))
        const lines = _read(path, start, bytes).split('\n').slice(1, -1).map((l) => l.replace(/\r$/, '')).filter((l) => l.length)
        return { names, rows: lines.slice(0, max).map((l) => l.split(',').slice(0, names.length).map((c) => c.slice(0, 2000))) }
}

export const generate = (seed, dir) => {
        const r = createRandom(seed)
        const m = createModel()
        const klass = seed % 10 < 7 ? 'small' : seed % 10 < 9 ? 'medium' : 'large'
        const steps = []
        let tokens = 0
        let saved = m.snapshot()
        const pages = () => m.pages()
        const page = (need) => r.pick(pages().filter((p) => !need || (p.cols.length && p.rows.size))) ?? r.pick(pages())
        const col = (p) => r.pick(p.cols)
        const row = (p) => r.pick([...p.rows.keys()])
        const either = () => r.chance(BOUNDS.either)
        const fresh = (pool, taken) => r.pick(pool.filter((n) => !taken.some((t) => fold(t) === fold(n)))) ?? null
        const text = () => (r.chance(0.15) ? null : r.chance(0.3) ? `tok${seed}_${++tokens} ${r.pick(_TEXTS)}` : r.pick(_TEXTS))
        const marks = (t) => r.some(_STYLES, 3).filter((n, i, a) => a.indexOf(n) === i).map((n) => [r.int(0, 6), r.int(0, Math.max(1, (t ?? '').length + 2)), n, 'v'])
        const file = _FILES[seed % _FILES.length]
        const slice = (k, max, bytes = 409600) => csv(dir, file, k * bytes + (seed % 7) * 1000, bytes, max)
        const build = {
                'page.add': () => ({ type: 'page.add', page: pages().length && either() ? page().name : fresh(_PAGES, pages().map((p) => p.name)) }),
                'page.del': () => ({ type: 'page.del', page: either() ? 'nope' : r.pick(pages().filter((p) => ![...m.windows.values()].some((w) => w.page === p.name)))?.name }),
                'row.add': () => ({ type: 'row.add', page: either() ? 'nope' : page().name }),
                'row.del': () => ((p) => ({ type: 'row.del', page: p.name, row: either() || !p.rows.size ? 1e6 + r.int(0, 9) : row(p) }))(page(true)),
                'col.add': () => ((p) => ({ type: 'col.add', page: p.name, col: either() && p.cols.length ? col(p).toUpperCase() : fresh(_COLS, p.cols) }))(page()),
                'col.del': () => ((p) => ({ type: 'col.del', page: p.name, col: either() || !p.cols.length ? 'nope' : col(p) }))(page()),
                'col.name': () => ((p) => ({ type: 'col.name', page: p.name, col: p.cols.length ? col(p) : 'nope', name: either() && p.cols.length ? col(p) : fresh(_COLS, p.cols) }))(page()),
                cell: () => ((p, t) => ({ type: 'cell', id: r.pick(_IDS), page: p.name, row: either() || !p.rows.size ? 1e6 + r.int(0, 9) : row(p), col: p.cols.length ? col(p) : 'nope', text: t, marks: marks(t) }))(page(true), text()),
                style: () => ((p) => ({ type: 'style', id: r.pick(_IDS), page: p.name, row: r.chance(0.3) || !p.rows.size ? 0 : row(p), col: p.cols.length && !either() ? col(p) : 'nope', name: r.chance(0.4) ? 'width' : r.pick(_STYLES), value: r.chance(0.2) ? null : String(r.int(1, 12)) }))(page(true)),
                window: () => ((p, id) => ({ type: 'window', id, page: either() && !m.windows.has(id) ? 'nope' : p.name, top: r.pick([0, 0, p.rows.size ? row(p) : 0, maxId(p) + 1]), size: r.pick([1, 3, r.int(1, 30), 200]) }))(page(true), r.pick(_IDS)),
                leave: () => ({ type: 'leave', id: r.pick(_IDS) }),
                import: () => {
                        const p = r.chance(0.5) && pages().length ? page() : null
                        const data = r.chance(0.6) ? slice(r.int(0, 50), r.int(5, 60)) : { names: r.some(_COLS, 4).filter((n, i, a) => a.indexOf(n) === i), rows: Array.from({ length: r.int(0, 30) }, () => Array.from({ length: r.int(0, 5) }, text)) }
                        if (!p) return { type: 'import', page: fresh(_PAGES, pages().map((q) => q.name)) ?? `csv${steps.length}`, names: data.names.length ? data.names : ['a'], rows: data.rows }
                        const names = p.cols.length ? r.some(p.cols, p.cols.length).filter((n, i, a) => a.indexOf(n) === i) : []
                        return { type: 'import', page: p.name, names: names.length ? names : [p.cols[0] ?? 'a'], rows: data.rows }
                },
                undo: () => ({ type: 'undo', id: _IDS.find((i) => m.canShift(i, 'undo')) ?? _IDS.find((i) => m.fresh(i)) }),
                redo: () => ({ type: 'redo', id: _IDS.find((i) => m.canShift(i, 'redo')) ?? _IDS.find((i) => m.fresh(i)) }),
                sql: () => ((p) => ({ type: 'sql', text: r.pick(_SQL).replace('%', p.name.replaceAll('"', '""')).replace('#', String(r.int(0, Math.max(1, maxId(p))))) }))(page(true)),
                save: () => ({ type: 'save' }),
                open: () => ({ type: 'open' }),
                invalid: () => {
                        const op = build[r.pick(['cell', 'style', 'window', 'page.add', 'col.add', 'row.del', 'import', 'col.name'])]()
                        const [field, value] = r.pick(_BAD.filter(([f]) => f in op))
                        return { ...op, [field]: value }
                },
        }
        const push = (op, fault) => {
                if (!op || Object.values(op).some((v) => v === undefined)) return
                const rate = BOUNDS.faults.rate[op.type] ?? BOUNDS.faults.rate.other
                const faults = fault ?? (r.chance(rate) ? [{ call: r.int(0, 3), kind: r.pick(BOUNDS.faults.kinds) }] : [])
                steps.push({ op, faults })
                if (op.type === 'open') m.restore(saved)
                if (op.type !== 'open') m.apply(op)
                if (op.type === 'save' && !faults.length) saved = m.snapshot()
        }
        const control = (ctl, extra = {}) => {
                const faults = ctl === 'recreate' && r.chance(BOUNDS.faults.rate.recreate) ? [{ call: r.int(0, 3), kind: r.pick(BOUNDS.faults.kinds) }] : []
                steps.push({ ctl, faults, ...extra })
                if (ctl === 'recreate' || ctl === 'rival') m.restore(saved)
        }
        const bulk = (k, rows, bytes) => push({ type: 'import', page: file.split('/').pop().replace(/\.csv$/, ''), ...slice(k, rows, bytes) }, [])
        for (let k = 0; klass === 'medium' && k < 60 && m.payload() < (3 + (seed % 5)) * 2 ** 20; k++) bulk(k, 2000, 409600)
        for (let k = 0; klass === 'large' && k < 60 && m.payload() < 34 * 2 ** 20; k++) bulk(k, 8000, 2 ** 21)
        if (klass === 'large') bulk(60, 8000, 2 ** 21)
        if (!pages().length) push({ type: 'page.add', page: 'p' }, [])
        if (!pages()[0].cols.length) push({ type: 'col.add', page: pages()[0].name, col: 'a' }, [])
        const [lo, hi] = BOUNDS.steps[klass]
        for (let n = r.int(lo, hi); n > 0; n--) {
                if (!pages().length) push({ type: 'page.add', page: 'p' }, [])
                const kind = r.weighted(_WEIGHTS)
                if (kind === 'rival') control('rival', { first: r.pick(['A', 'B']) })
                else if (kind === 'stale') (control('stale'), control('recreate'))
                else if (kind === 'recreate' || kind === 'verify') control(kind)
                else push(build[kind]())
                if (steps.at(-1)?.op?.type === 'save' && r.chance(0.3)) control('recreate')
        }
        return { seed, klass, file, steps }
}
