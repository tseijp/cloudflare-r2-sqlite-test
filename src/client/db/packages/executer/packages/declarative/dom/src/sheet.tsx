import { useEffect, useMemo, useRef } from 'react'
import { dropEvent } from '@db/client-executer-dom-event'
import { PAPER, ROWS, SQUARE } from '@db/client-share'
import { Cell, Editor, Head } from './cell.tsx'
import type { CSSProperties, KeyboardEvent, WheelEvent } from 'react'
import type { Dispatch, Snap } from '@db/client-share'

const _GUTTER = 2

const _GRID = 'linear-gradient(to right, #e5e5e5 1px, transparent 1px), linear-gradient(to bottom, #e5e5e5 1px, transparent 1px)'

const _LABEL = 'absolute flex items-center justify-center text-[11px] text-[#5f6368]'

const _letter = (index: number): string => (index < 26 ? String.fromCharCode(65 + index) : _letter(Math.floor(index / 26) - 1) + String.fromCharCode(65 + (index % 26)))

export const Sheet = ({ snap, dispatch }: { snap: Snap; dispatch: Dispatch }) => {
        const root = useRef<HTMLDivElement>(null)
        const turn = useRef(0)
        const lefts = snap.cols.reduce<number[]>((found, [, width]) => [...found, found[found.length - 1] + width], [0])
        const total = Math.max(PAPER, lefts[lefts.length - 1])
        const box = (slot: number, index: number): CSSProperties => ({ left: (_GUTTER + lefts[index]) * SQUARE, top: (slot + 2) * SQUARE, width: (snap.cols[index]?.[1] ?? 0) * SQUARE, height: SQUARE })
        const drop = useMemo(
                () =>
                        dropEvent(() => {
                                const file = drop.event?.type === 'drop' ? drop.event.dataTransfer?.files?.[0] : null
                                if (file) void file.text().then((text: string) => dispatch({ type: 'file', name: file.name, text }))
                        }),
                [],
        )
        const onKey = (e: KeyboardEvent) => dispatch({ type: 'key', key: e.key, shift: e.shiftKey, meta: e.metaKey || e.ctrlKey, composing: e.nativeEvent.isComposing }) && e.preventDefault()
        const onWheel = (e: WheelEvent) => {
                turn.current += e.deltaY
                if (Math.abs(turn.current) < SQUARE * 3) return
                dispatch({ type: 'wheel', dy: turn.current })
                turn.current = 0
        }
        useEffect(() => (drop.ref(root.current), () => drop.ref(null)), [])
        useEffect(() => void (snap.edit || root.current?.focus()), [!snap.edit])
        return (
                <div ref={root} tabIndex={0} onKeyDown={onKey} onWheel={onWheel} className="overflow-x-auto rounded-xl border border-[#d9d9d9] bg-white outline-none">
                        <div className="relative select-none" style={{ width: (total + _GUTTER) * SQUARE, height: (ROWS + 2) * SQUARE, backgroundImage: _GRID, backgroundSize: `${SQUARE}px ${SQUARE}px` }}>
                                {Array.from({ length: total }, (_, index) => (
                                        <div key={index} className={_LABEL} style={{ left: (_GUTTER + index) * SQUARE, top: 0, width: SQUARE, height: SQUARE }}>
                                                {_letter(index)}
                                        </div>
                                ))}
                                {Array.from({ length: ROWS }, (_, slot) => (
                                        <div key={slot} className={_LABEL + ' bg-[#f7f7f7]'} style={{ left: 0, top: (slot + 2) * SQUARE, width: _GUTTER * SQUARE, height: SQUARE }}>
                                                {snap.rows[slot]?.[0]}
                                        </div>
                                ))}
                                {snap.cols.map(([name, width], index) => (
                                        <Head key={name} name={name} width={width} slot={-1} index={index} box={box(-1, index)} dispatch={dispatch} />
                                ))}
                                {snap.rows.map((row, slot) => snap.cols.map(([col], index) => <Cell key={`${row[0]}/${col}`} text={row[index + 1] ?? ''} marks={snap.marks[`${row[0]}/${col}`]} fill={snap.styles[`${row[0]}/${col}/fill`]} slot={slot} index={index} box={box(slot, index)} dispatch={dispatch} />))}
                                {snap.sel && <div className="pointer-events-none absolute z-10 border-2 border-black" style={box(snap.sel[0], snap.sel[1])} />}
                                {snap.sel && snap.edit && <Editor edit={snap.edit} box={box(snap.sel[0], snap.sel[1])} dispatch={dispatch} />}
                        </div>
                </div>
        )
}
