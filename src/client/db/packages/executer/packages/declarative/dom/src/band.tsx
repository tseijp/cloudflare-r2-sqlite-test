import { FILLS } from '@db/client-share'
import type { MouseEvent } from 'react'
import type { Dispatch, Event, Snap } from '@db/client-share'

const _CARDS: [label: string, event: Event][] = [
        ['ページを追加', { type: 'add', kind: 'page' }],
        ['行を追加', { type: 'add', kind: 'row' }],
        ['列を追加', { type: 'add', kind: 'col' }],
        ['ページを削除', { type: 'remove', kind: 'page' }],
        ['行を削除', { type: 'remove', kind: 'row' }],
        ['列を削除', { type: 'remove', kind: 'col' }],
        ['太字', { type: 'bold' }],
        ['元に戻す', { type: 'undo' }],
        ['やり直す', { type: 'redo' }],
        ['保存', { type: 'save' }],
        ['開き直す', { type: 'open' }],
]

const _BUTTON = 'h-8 rounded-md border border-[#d9d9d9] bg-white px-3 hover:bg-[#f1f1f1]'

const _TAB = 'h-8 rounded-md px-3 '

const _hold = (e: MouseEvent) => e.preventDefault()

export const Band = ({ snap, dispatch }: { snap: Snap; dispatch: Dispatch }) => (
        <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                        {_CARDS.map(([label, event]) => (
                                <button key={label} className={_BUTTON} onMouseDown={_hold} onClick={() => void dispatch(event)}>
                                        {label}
                                </button>
                        ))}
                        {FILLS.map((value) => (
                                <button key={value} title="塗り" className="size-8 rounded-md border border-[#d9d9d9]" style={{ background: value || '#ffffff' }} onMouseDown={_hold} onClick={() => void dispatch({ type: 'fill', value })} />
                        ))}
                </div>
                <div className="flex flex-wrap gap-1 rounded-lg bg-[#f1f1f1] p-1">
                        {snap.pages.map((page) => (
                                <button key={page} className={_TAB + (page === snap.page ? 'bg-white font-medium' : 'text-[#5f6368]')} onClick={() => void dispatch({ type: 'page', page })}>
                                        {page}
                                </button>
                        ))}
                </div>
        </div>
)
