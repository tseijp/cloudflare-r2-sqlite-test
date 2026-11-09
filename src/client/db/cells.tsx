import { HEAD } from './utils/const/const.ts'
import { CSS } from './utils/config/config.ts'
import { box, letterOf, rectOf } from './squares.ts'
import { format, styleOf } from './utils/value/value.ts'
import type { Col, Deco, Page, Row, Sel } from './utils/types/types.ts'

interface Line {
        id: number
        pos: number
        row: Row
        deco: Deco | undefined
}

interface Field {
        x: number
        y: number
        w: number
}

interface Handlers {
        onKeyDown(e: any): void
        onBlur(e: any): void
        onCompositionStart(): void
        onCompositionEnd(): void
}

interface BarProps {
        pages: Page[]
        current: string | undefined
        onOpen(pid: string): unknown
        onAddRow(): unknown
        onAddCol(): unknown
}

export const Ruler = ({ squares }: { squares: number }) => (
        <div style={CSS.band}>
                {Array.from({ length: squares }, (_, i) => (
                        <div key={i} style={{ ...CSS.cell, ...CSS.letter, ...box(i, 1, 1) }}>
                                {letterOf(i)}
                        </div>
                ))}
        </div>
)

export const Header = ({ cols, xs }: { cols: Col[]; xs: number[] }) => (
        <div style={CSS.band}>
                {cols.map((col, c) => (
                        <div key={col.id} data-r={HEAD} data-c={c} style={{ ...CSS.cell, ...CSS.head, ...box(xs[c], 1, col.width) }}>
                                {col.name}
                                <span data-sort={c} style={CSS.sort}>
                                        ↕
                                </span>
                                <span data-w={c} style={CSS.handle} />
                        </div>
                ))}
        </div>
)

export const Lines = ({ lines, cols, xs }: { lines: Line[]; cols: Col[]; xs: number[] }) =>
        lines.map((line) =>
                cols.map((col, c) => (
                        <div key={`${line.id}:${col.id}`} data-r={line.pos} data-c={c} style={{ ...CSS.cell, ...box(xs[c], line.pos, col.width), ...styleOf(line.deco?.styles[col.name]) }}>
                                {format(line.row[col.name])}
                        </div>
                )),
        )

export const Selection = ({ sel, xs }: { sel: Sel; xs: number[] }) => <div style={{ ...CSS.frame, ...rectOf(sel, xs) }} />

export const Editor = ({ field, row, seed, handlers }: { field: Field; row: number; seed: string; handlers: Handlers }) => <input autoFocus defaultValue={seed} {...handlers} style={{ ...CSS.input, ...box(field.x, row, field.w) }} />

export const Bar = ({ pages, current, onOpen, onAddRow, onAddCol }: BarProps) => (
        <div style={CSS.bar}>
                {pages.map((page) => (
                        <button key={page.id} onClick={() => onOpen(page.id)} style={{ fontWeight: page.id === current ? 700 : 400 }}>
                                {page.name}
                        </button>
                ))}
                <span style={{ flex: 1 }} />
                <button onClick={onAddRow}>+ 行</button>
                <button onClick={onAddCol}>+ 列</button>
        </div>
)
