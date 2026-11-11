// 依頼 1: 判定に渡す直前の観測を 1 か所だけ変える。kind は judge の seen() の第 1 引数、返り値 undefined は「変えなかった」
const _edit = (rows, test, f) => {
        for (const [i, r] of rows.entries()) for (const [j, c] of r.entries()) if (test(c, j)) return rows.with(i, r.with(j, f(c)))
        return undefined
}
const _str = (c, j) => j > 0 && typeof c === 'string' && c.length > 0
const _flip = (s) => (s[0] === 'Q' ? 'R' : 'Q') + s.slice(1) // 長さを変えずに 1 文字だけ変える (合計の指紋では見えない変え方)
const _drop = (rows) => (rows.length ? rows.slice(0, -1) : undefined)
const _case = (s) => s.replace(/[a-z]/i, (ch) => (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase())) // 最初の ASCII 文字の大文字小文字だけ変える (綴り違いの装飾の行)
const _orphan = (name) => (rows) => [...rows, name === '_mark' ? ['zz', 999999, 'zz', 0, 'bold', 1, 'v'] : ['zz', 999999, 'zz', 'fill', '1']] // 位置の無い装飾の行を 1 行足す
const _col = (j) => (rows) => _edit(rows, (c, k) => k === j && typeof c === 'string' && /[a-z]/i.test(c), _case)
const _inView = (v, suffix, f) => ((g) => g && ((rows) => rows && { ...v, [g]: rows })(f(v[g])))(Object.keys(v).find((g) => g.endsWith(suffix) && Array.isArray(v[g]) && v[g].length))
const _on = (kind, f) => (k, v) => (k === kind ? f(v) : undefined)

export const MUTATIONS = {
        // 窓 / 装飾 / 履歴 (前回から)
        'view.rows.text': _on('view', (v) => _inView(v, '/rows', (rows) => _edit(rows, _str, _flip))),
        'view.rows.drop': _on('view', (v) => _inView(v, '/rows', _drop)),
        'view.last': _on('view', (v) => _inView(v, '/last', (rows) => _edit(rows, (c) => typeof c === 'number', (n) => n + 1))),
        'view.cols.width': _on('view', (v) => _inView(v, '/cols', (rows) => _edit(rows, (c, j) => j === 1, (w) => (w === '4' ? '5' : '4')))),
        'view.styles.drop': _on('view', (v) => _inView(v, '/styles', _drop)),
        'view.marks.drop': _on('view', (v) => _inView(v, '/marks', _drop)),
        'rows.text': _on('rows', (v) => _edit(v, _str, _flip)),
        'styles.value': _on('styles', (v) => _edit(v, (c, j) => j === 4 && typeof c === 'string' && c.length > 0, _flip)),
        'styles.drop': _on('styles', _drop),
        'marks.stop': _on('marks', (v) => _edit(v, (c, j) => j === 5, (n) => n + 1)),
        'marks.drop': _on('marks', _drop),
        // 装飾 (依頼 2): 位置の無い行を足す、page / col の綴りだけ変える。毎 step の全行比較 (styles / marks)、大きい table の指紋 (fp、大文字 1 文字ぶん = hex の 6 → 4 の差)、窓 (view)、store の写し (store *)
        'styles.orphan': _on('styles', _orphan('_style')), 'marks.orphan': _on('marks', _orphan('_mark')), 'styles.case': _on('styles', _col(2)), 'marks.case': _on('marks', _col(2)), 'styles.page': _on('styles', _col(0)),
        'store.styles.orphan': _on('store styles', _orphan('_style')), 'store.marks.orphan': _on('store marks', _orphan('_mark')), 'store.styles.case': _on('store styles', _col(2)), 'store.marks.case': _on('store marks', _col(2)),
        'view.styles.case': _on('view', (v) => _inView(v, '/styles', _col(1))), 'view.marks.case': _on('view', (v) => _inView(v, '/marks', _col(1))), 'fp.styles.case': _on('styles fp', ([sums, h]) => [sums.with(3, sums[3] - 1), h]), 'fp.marks.case': _on('marks fp', ([sums, h]) => [sums.with(5, sums[5] - 1), h]),
        'touched.value': _on('touched', (v) => (typeof v === 'string' && v.length ? _flip(v) : v === null ? 'Q' : undefined)),
        // 回数: store の呼び出しの記録 (open / save / clean は sig、SQL の page 読みは reads) と stat
        'sig.drop': _on('sig', _drop),
        'sig.put': _on('sig', (v) => [...v, ['put', 9, 1, '']]),
        'sig.seq': _on('sig', (v) => (typeof v[0]?.[1] === 'number' ? v.with(0, v[0].with(1, 7)) : undefined)),
        'reads.put': _on('reads', (v) => [...v, ['put', 9, 1, '']]),
        'reads.offset': _on('reads', (v) => (v.length ? v.with(0, v[0].with(2, v[0][2] + 1)) : undefined)),
        'dirty.zero': _on('dirty', (v) => (v > 0 ? 0 : undefined)),
        'stat.base': _on('stat', (v) => ({ ...v, base: v.base + 1 })),
        'stat.deltas': _on('stat', (v) => ({ ...v, deltas: v.deltas + 1 })),
        // 鎖: object の一覧と復号の可否
        'slots.over': _on('slots', (v) => ({ ...v, seqs: [...v.seqs, 9] })),
        'slots.corrupt': _on('slots', (v) => ({ ...v, ok: false })),
        'merged.delta': _on('merged', (v) => (v.includes(1) ? undefined : [...v, 1])),
        'leftover.keep': _on('leftover', (v) => (v.length ? undefined : [9])),
        // 単一書き: 後から save した側の成否と、store の tag
        'later.loser': _on('later', (v) => ({ ...v, loser: !v.loser })),
        'later.winner': _on('later', (v) => ({ ...v, winner: !v.winner })),
        'kept.tag': _on('kept', (v) => (v.length ? v.with(0, [v[0][0], 'tX']) : undefined)),
        // 上限: stat と store の page 数、patch + dirty、full の時点の payload
        'pages.stat': _on('pages', (v) => ({ ...v, stat: 8193 })),
        'pages.store': _on('pages', (v) => ({ ...v, store: 8193 })),
        'patch.full': _on('patch', () => 512),
        'over.resolve': _on('over', (v) => !v),
        'full.small': _on('full', () => 1),
        // compile: compile の出力と、命令の成否
        'throws.flip': _on('throws', (v) => !v),
        'pure.differ': _on('pure', ([a, b]) => (b.ok ? [a, { ...b, value: [...b.value, ['sql', 'x', []]] }] : undefined)),
        'codes.unknown': _on('codes', (v) => [...v, ['nope']]),
        'params.leak': _on('params', (v) => (v.strings.length ? { ...v, text: `${v.text}\n${v.strings[0]}` } : undefined)),
        'plan.flip': _on('plan', (v) => (v.length ? [] : [['push']])),
        'accept.flip': _on('accept', (v) => !v),
        'reject.flip': _on('reject', (v) => !v),
        'result.num': _on('result', (v) => (Array.isArray(v) ? _edit(v, (c) => typeof c === 'number', (n) => n + 1) ?? _drop(v) : undefined)),
}
