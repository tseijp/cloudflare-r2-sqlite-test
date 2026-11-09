import { dragEvent, dropEvent } from '../procedural/event/index'
import { AHEAD, BAND, FILL, SQ, WINDOW } from './const'
import { format, nextOrder, parseCsv, span } from '../procedural/paint/index'
import type * as React from 'react'
import type { Store } from './store'
import type { Send } from '../procedural/share/types'

const _STEPS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }

const _hitOf = (el: unknown) => {
        const hit = (el as Element | null)?.closest?.('[data-r]') as HTMLElement | null
        return hit ? { row: Number(hit.dataset.r), col: Number(hit.dataset.c) } : null
}

const _isOn = (e: Event, selector: string) => !!(e.target as Element | null)?.closest?.(selector)

export const createGesture = (store: Store, send: Send) => {
        let _sheet: HTMLElement | null = null
        let _moved = ''
        const _page = () => store.win()?.page ?? ''
        const _reveal = (row: number) => {
                const top = (row - 1) * SQ
                const isAbove = !!_sheet && top < _sheet.scrollTop
                const isBelow = !!_sheet && top + SQ * (BAND + 1) > _sheet.scrollTop + _sheet.clientHeight
                if (isAbove) _sheet!.scrollTop = top
                if (isBelow) _sheet!.scrollTop = top + SQ * (BAND + 1) - _sheet!.clientHeight
        }
        const _place = (row: number, col: number, isExtend: boolean) => {
                const prev = store.ui().sel
                const base = isExtend && prev ? prev : { row, col }
                store.set({ sel: { row: base.row, col: base.col, row2: row, col2: col } })
                _reveal(row)
        }
        const _step = ([dr, dc]: [number, number], isExtend: boolean) => {
                const sel = store.ui().sel
                const last = store.fields().length - 1
                if (sel) _place(Math.max(1, sel.row2 + dr), Math.min(last, Math.max(0, sel.col2 + dc)), isExtend)
        }
        const _start = (row: number, col: number, seed?: string) => {
                const field = store.fields()[col]
                const line = store.lineAt(row)
                const isHead = row === 0
                if (!field || (!isHead && !line)) return
                store.set({ edit: { row, col, seed: seed ?? (isHead ? field.name : format(line!.values[field.at], field.type)) } })
        }
        const _commit = (text: string) => {
                const edit = store.ui().edit
                const field = edit && store.fields()[edit.col]
                const line = edit && store.lineAt(edit.row)
                store.set({ edit: null })
                if (!edit || !field) return
                const name = text.trim()
                const isRename = edit.row === 0 && !!name && name !== field.name
                if (isRename) return send.act({ kind: 'col.set', page: _page(), name: field.name, to: name })
                if (!line || format(line.values[field.at], field.type) === text) return
                return send.act({ kind: 'cells', page: _page(), cells: [{ row: line.id, col: field.name, value: text }] })
        }
        const _picked = () => {
                const sel = store.ui().sel
                const [r1, r2] = sel ? span(sel.row, sel.row2) : [0, -1]
                const [c1, c2] = sel ? span(sel.col, sel.col2) : [0, -1]
                const fields = store.fields().slice(c1, c2 + 1)
                return store.lines().filter((line) => line.pos >= r1 && line.pos <= r2).flatMap((line) => fields.map((field) => ({ line, field })))
        }
        const _each = (kind: string, cellOf: (picked: ReturnType<typeof _picked>[number]) => object) => {
                const cells = _picked().map(cellOf)
                if (cells.length) return send.act({ kind, page: _page(), cells })
        }
        const _clear = () => _each('cells', ({ line, field }) => ({ row: line.id, col: field.name, value: null }))
        const _toggle = () => {
                const sel = store.ui().sel!
                const field = store.fields()[sel.col2]
                const line = store.lineAt(sel.row2)
                const isBool = field?.type === 'bool' && !!line
                if (isBool) return send.act({ kind: 'cells', page: _page(), cells: [{ row: line!.id, col: field.name, value: line!.values[field.at] ? 0 : 1 }] })
        }
        const _open = (page: string, view: object = {}) => send.move({ ...view, page, from: 1, to: WINDOW })
        const _select = dragEvent<HTMLElement>(
                () => {
                        const hit = _hitOf(document.elementFromPoint(_select.value[0], _select.value[1]))
                        const isPlaced = !_select.isDragEnd && !!hit && hit.row > 0
                        if (isPlaced) _place(hit!.row, hit!.col, _select.isDragging || (_select.event as PointerEvent).shiftKey)
                        if (_select.isDragStart) _sheet?.focus()
                },
                (e) => _isOn(e, '[data-r]') && !_isOn(e, '[data-w],[data-sort]'),
        )
        const _resize = dragEvent<HTMLElement>(
                () => {
                        const memo = _resize.memo
                        const drag = store.ui().drag
                        const col = _resize.isDragStart ? _hitOf(_resize.event.target)!.col : memo.col
                        if (_resize.isDragStart) Object.assign(memo, { col, base: store.fields()[col].width })
                        if (!_resize.isDragEnd) return store.set({ drag: { col, width: Math.min(12, Math.max(1, memo.base + Math.round(_resize.movement[0] / SQ))) } })
                        store.set({ drag: null })
                        const isResized = !!drag && drag.width !== memo.base
                        if (isResized) send.act({ kind: 'col.set', page: _page(), name: store.fields()[col].name, width: drag!.width })
                },
                (e) => _isOn(e, '[data-w]'),
        )
        const _drop = dropEvent<HTMLElement>(
                async () => {
                        const event = _drop.event as DragEvent
                        const files = _drop.isDropEnd && event.type === 'drop' ? [...(event.dataTransfer?.files ?? [])] : []
                        const sheets = await Promise.all(files.map(async (file) => ({ name: file.name.replace(/\.[^.]+$/, ''), rows: parseCsv((await file.text()).replace(/^﻿/, '')) })))
                        if (sheets.length) send.load(sheets)
                },
                (e) => !!e.dataTransfer?.types.includes('Files'),
        )
        return {
                ref: (el: HTMLElement | null) => {
                        _sheet = el
                        _select.ref(el)
                        _resize.ref(el)
                        _drop.ref(el)
                },
                onKeyDown: (e: React.KeyboardEvent) => {
                        const sel = store.ui().sel
                        const key = e.key.toLowerCase()
                        const isMod = e.metaKey || e.ctrlKey
                        const isUndo = isMod && key === 'z' && !e.shiftKey
                        const isRedo = isMod && (key === 'y' || (key === 'z' && e.shiftKey))
                        const isIdle = !!sel && !store.ui().edit
                        const isTyped = isIdle && e.key.length === 1 && !isMod && e.key !== ' '
                        const act = (fn: () => unknown) => {
                                e.preventDefault()
                                fn()
                        }
                        if (isUndo) return act(send.undo)
                        if (isRedo) return act(send.redo)
                        if (!isIdle) return
                        if (_STEPS[e.key]) return act(() => _step(_STEPS[e.key], e.shiftKey))
                        if (e.key === 'Tab') return act(() => _step([0, e.shiftKey ? -1 : 1], false))
                        if (e.key === 'Enter' || e.key === 'F2') return act(() => _start(sel.row2, sel.col2))
                        if (e.key === 'Delete' || e.key === 'Backspace') return act(_clear)
                        if (e.key === ' ') return act(_toggle)
                        if (isTyped) return act(() => _start(sel.row2, sel.col2, e.key))
                },
                onDoubleClick: (e: React.MouseEvent) => {
                        const hit = _hitOf(e.target)
                        if (hit) _start(hit.row, hit.col)
                },
                onScroll: (e: React.UIEvent<HTMLElement>) => {
                        const el = e.currentTarget
                        const win = store.win()
                        const top = Math.max(1, Math.floor(el.scrollTop / SQ))
                        const bottom = Math.min(win?.rows ?? 0, top + Math.ceil(el.clientHeight / SQ))
                        const from = Math.max(1, top - AHEAD)
                        const isInside = !win || (top >= win.from && bottom <= win.to) || _moved === `${win.page}:${from}`
                        if (isInside) return
                        _moved = `${win.page}:${from}`
                        send.move({ page: win.page, from, to: from + WINDOW - 1, order: win.order, filter: win.filter, search: win.search })
                },
                sort: (col: number) => {
                        const win = store.win()
                        const field = store.fields()[col]
                        if (win && field) _open(win.page, { order: nextOrder(win.order, field.name), search: win.search })
                },
                editor: {
                        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                                const isEnter = e.key === 'Enter' && !e.nativeEvent.isComposing
                                const isDone = isEnter || e.key === 'Tab'
                                if (e.key === 'Escape') store.set({ edit: null })
                                if (e.key === 'Escape') _sheet?.focus()
                                if (!isDone) return
                                e.preventDefault()
                                _commit(e.currentTarget.value)
                                _step(isEnter ? [1, 0] : [0, 1], false)
                                _sheet?.focus()
                        },
                        onBlur: (e: React.FocusEvent<HTMLInputElement>) => _commit(e.currentTarget.value),
                },
                bar: {
                        open: (page: string) => _open(page),
                        search: (text: string) => _open(_page(), { order: store.win()?.order, search: text || undefined }),
                        addPage: async () => {
                                const done = await send.act({ kind: 'page.add', name: `シート${store.pages().length + 1}` })
                                if (done?.id) _open(String(done.id))
                        },
                        addRow: async () => {
                                const done = await send.act({ kind: 'row.add', page: _page() })
                                const win = store.win()
                                const isOutside = !!win && done?.id > win.to
                                if (isOutside) await send.move({ page: win.page, from: Math.max(1, done.id - WINDOW + AHEAD), to: done.id + AHEAD })
                                if (done?.id) _place(done.id, 0, false)
                        },
                        fill: () => _each('style', ({ line, field }) => ({ row: line.id, col: field.name, json: line.deco?.s?.[field.name] ? null : JSON.stringify({ fill: FILL }) })),
                        bold: () =>
                                _each('cells', ({ line, field }) => {
                                        const text = format(line.values[field.at], field.type)
                                        const isBold = !!line.deco?.m?.[field.name]?.some((m) => m.attr === 'bold')
                                        return { row: line.id, col: field.name, marks: isBold ? [] : [{ from: 0, to: text.length, attr: 'bold', val: '1' }] }
                                }),
                        addCol: () => send.act({ kind: 'col.add', page: _page(), name: `列${store.fields().length + 1}`, type: 'text' }),
                        undo: () => send.undo(),
                        redo: () => send.redo(),
                },
        }
}

export type Gesture = ReturnType<typeof createGesture>
