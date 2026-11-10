import { CSS, SQ } from './const'
import { format, letterOf, runsOf, span, styleOf } from '../procedural/paint/index'
import type { Gesture } from './gesture'
import type { Edit, Field, Line, Order, Page, Sel } from '../procedural/share/types'

const _box = (x: number, y: number, w: number, h = 1) => ({ left: x * SQ, top: y * SQ, width: w * SQ, height: h * SQ })

export const Bar = ({ pages, page, bar }: { pages: Page[]; page?: string; bar: Gesture['bar'] }) => (
        <div style={CSS.bar}>
                {pages.map((p) => (
                        <button key={p.name} onClick={() => bar.open(p.name)} style={{ ...CSS.tab, fontWeight: p.name === page ? 700 : 400 }}>
                                {p.name}
                        </button>
                ))}
                <button onClick={bar.addPage} style={CSS.tab}>
                        + ページ
                </button>
                <span style={{ flex: 1 }} />
                <input placeholder="検索" onChange={(e) => bar.search(e.currentTarget.value)} style={CSS.tab} />
                <button onClick={bar.bold} style={{ ...CSS.tab, fontWeight: 700 }}>
                        B
                </button>
                <button onClick={bar.fill} style={CSS.tab}>
                        塗り
                </button>
                <button onClick={bar.undo} style={CSS.tab}>
                        ↶
                </button>
                <button onClick={bar.redo} style={CSS.tab}>
                        ↷
                </button>
                <button onClick={bar.addRow} disabled={!page} style={CSS.tab}>
                        + 行
                </button>
                <button onClick={bar.addCol} disabled={!page} style={CSS.tab}>
                        + 列
                </button>
        </div>
)

export const Ruler = ({ squares }: { squares: number }) =>
        Array.from({ length: squares }, (_, i) => (
                <div key={i} style={{ ...CSS.letter, ..._box(i, 0, 1) }}>
                        {letterOf(i)}
                </div>
        ))

export const Head = ({ fields, xs, order, onSort }: { fields: Field[]; xs: number[]; order?: Order; onSort(col: number): void }) =>
        fields.map((field, c) => (
                <div key={field.name} data-r={0} data-c={c} style={{ ...CSS.head, ..._box(xs[c], 1, field.width) }}>
                        {field.name}
                        <span data-sort={c} onClick={() => onSort(c)} style={CSS.sort}>
                                {order?.col === field.name ? (order.dir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                        <span data-w={c} data-r={0} data-c={c} style={CSS.handle} />
                </div>
        ))

export const Lines = ({ lines, fields, xs }: { lines: Line[]; fields: Field[]; xs: number[] }) =>
        lines.map((line) =>
                fields.map((field, c) => (
                        <div key={`${line.id}:${field.name}`} data-r={line.pos} data-c={c} style={{ ...CSS.data, ..._box(xs[c], line.pos - 1, field.width), ...styleOf(line.deco?.s?.[field.name]) }}>
                                {runsOf(format(line.values[field.at], field.type), line.deco?.m?.[field.name]).map((run, i) => (
                                        <span key={i} style={run.style}>
                                                {run.text}
                                        </span>
                                ))}
                        </div>
                )),
        )

export const Frame = ({ sel, xs }: { sel: Sel; xs: number[] }) => {
        const [r1, r2] = span(sel.row, sel.row2)
        const [c1, c2] = span(sel.col, sel.col2)
        return <div style={{ ...CSS.frame, ..._box(xs[c1], r1 - 1, xs[c2 + 1] - xs[c1], r2 - r1 + 1) }} />
}

export const Editor = ({ edit, xs, fields, editor }: { edit: Edit; xs: number[]; fields: Field[]; editor: Gesture['editor'] }) => {
        const width = fields[edit.col]?.width ?? 1
        const top = edit.row === 0 ? 1 : edit.row - 1
        return <input autoFocus defaultValue={edit.seed} {...editor} style={{ ...CSS.input, ..._box(xs[edit.col], top, width) }} />
}
