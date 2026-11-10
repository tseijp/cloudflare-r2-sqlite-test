import { useMemo, useState } from 'react'
import { dragEvent } from '@db/client-executer-dom-event'
import { SQUARE } from '@db/client-share'
import type { CSSProperties } from 'react'
import type { Dispatch, Edit } from '@db/client-share'

interface Spot {
        slot: number
        index: number
        box: CSSProperties
        dispatch: Dispatch
}

const _CELL = 'absolute overflow-hidden whitespace-nowrap border-b border-r border-[#d9d9d9] px-1 leading-[23px]'

const _spans = (text: string, marks: any[][] = []) => {
        const cuts = [...new Set([0, text.length, ...marks.flatMap(([start, stop]) => [start, stop])])].filter((at) => at <= text.length).sort((a, b) => a - b)
        return cuts.slice(0, -1).map((from, order) => ({ from, text: text.slice(from, cuts[order + 1]), isBold: marks.some(([start, stop, name]) => name === 'bold' && start <= from && from < stop) }))
}

const Handle = ({ index, width, dispatch }: { index: number; width: number; dispatch: Dispatch }) => {
        const [grow, setGrow] = useState(0)
        const drag = useMemo(
                () =>
                        dragEvent(() => {
                                if (drag.isDragging) setGrow((drag.memo.grow = Math.round(drag.movement[0] / SQUARE)))
                                if (!drag.isDragEnd) return
                                dispatch({ type: 'resize', index, width: width + (drag.memo.grow ?? 0) })
                                setGrow((drag.memo.grow = 0))
                        }),
                [index, width],
        )
        return <div ref={drag.ref} className="absolute right-0 top-0 z-10 h-full w-[5px] cursor-col-resize touch-none hover:bg-[#4185f4]" style={{ transform: `translateX(${grow * SQUARE}px)` }} />
}

export const Head = ({ name, width, slot, index, box, dispatch }: Spot & { name: string; width: number }) => (
        <div className={_CELL + ' bg-[#f1f1f1] font-medium text-[#5f6368]'} style={box} onPointerDown={() => void dispatch({ type: 'pick', slot, index })} onDoubleClick={() => void dispatch({ type: 'edit' })}>
                {name}
                <Handle index={index} width={width} dispatch={dispatch} />
        </div>
)

export const Cell = ({ text, marks, fill, slot, index, box, dispatch }: Spot & { text: string; marks?: any[][]; fill?: string }) => (
        <div className={_CELL} style={{ ...box, background: fill || '#ffffff' }} onPointerDown={() => void dispatch({ type: 'pick', slot, index })} onDoubleClick={() => void dispatch({ type: 'edit' })}>
                {_spans(text, marks).map((span) => (
                        <span key={span.from} className={span.isBold ? 'font-bold' : ''}>
                                {span.text}
                        </span>
                ))}
        </div>
)

export const Editor = ({ edit, box, dispatch }: { edit: Edit; box: CSSProperties; dispatch: Dispatch }) => {
        const onType = (e: any) => void dispatch({ type: 'type', text: e.currentTarget.value, start: e.currentTarget.selectionStart ?? 0, stop: e.currentTarget.selectionEnd ?? 0 })
        return <input autoFocus value={edit.text} onChange={onType} onSelect={onType} onBlur={() => void dispatch({ type: 'commit', dx: 0, dy: 0 })} className="absolute z-20 border-2 border-[#4185f4] bg-white px-1 outline-none" style={box} />
}
