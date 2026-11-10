import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { readCsv } from './csv.mjs'

export const WINDOW = 50

export const LIMIT_BYTES = 100 * 1024 * 1024

const _NUMBER = /^\s*[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?\s*$/

const _walk = (dir) =>
        readdirSync(dir, { withFileTypes: true })
                .sort((a, b) => (a.name < b.name ? -1 : 1))
                .flatMap((e) => (e.isDirectory() ? _walk(join(dir, e.name)) : [join(dir, e.name)]))

const _createStats = () => {
        const _s = { records: 0, cols: 0, cells: 0, cellBytes: 0, maxCell: 0, kinds: [] }
        const add = (row, rowBytes, rowMax) => {
                _s.records++
                _s.cols = Math.max(_s.cols, row.length)
                _s.cells += row.length
                _s.cellBytes += rowBytes - row.length
                if (rowMax > _s.maxCell) _s.maxCell = rowMax
                if (_s.records === 1) return
                for (let c = 0; c < row.length; c++) {
                        const v = row[c]
                        if (v === '' || _s.kinds[c] === -1) continue
                        _s.kinds[c] = _NUMBER.test(v) ? 1 : -1
                }
        }
        const done = () => ({ ..._s, kinds: undefined, numeric: _s.kinds.filter((k) => k === 1).length })
        return { add, done }
}

const _content = (cols, ratio, maxCell, limit) => {
        if (maxCell > limit) return '長文'
        if (ratio < 0.7) return '短文 categorical'
        if (cols <= 10) return '細長 numeric'
        return '幅広 numeric'
}

const _scale = (rows) => {
        if (rows < WINDOW * 100) return '小'
        if (rows < WINDOW * 2000) return '中'
        return '大'
}

const _measure = (root, path, limit) => {
        const st = _createStats()
        readCsv(readFileSync(path), st.add)
        const s = st.done()
        const ratio = s.numeric / Math.max(1, s.cols)
        const klass = { content: _content(s.cols, ratio, s.maxCell, limit), container: '単一', scale: _scale(s.records) }
        const bytes = statSync(path).size
        const avgCell = s.cellBytes / Math.max(1, s.cells)
        const file = relative(root, path)
        const shape = { rows: s.records, cols: s.cols, numericRatio: ratio, avgCell, maxCell: s.maxCell, sheets: 1 }
        return { file, bytes, ...shape, class: klass }
}

const _excluded = (root, path) => {
        const bytes = statSync(path).size
        if (/\.xlsx$/i.test(path)) return { file: relative(root, path), bytes, excluded: 'xlsx は試験外 (利用者の指示)' }
        if (bytes > LIMIT_BYTES) return { file: relative(root, path), bytes, excluded: '100MB 超' }
        return null
}

export const scanData = (root, limit, onFile = () => {}) =>
        _walk(root)
                .filter((path) => /\.(csv|xlsx)$/i.test(path))
                .map((path) => {
                        const out = _excluded(root, path)
                        onFile(relative(root, path), !!out)
                        return out ?? _measure(root, path, limit)
                })
