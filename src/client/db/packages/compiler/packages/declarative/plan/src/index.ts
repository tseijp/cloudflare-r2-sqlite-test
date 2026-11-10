import { BATCH, ROWS, WIDE } from '@db/client-share'
import { toMarks, toMoved, toTarget, toText, toToggled } from '@db/client-compiler-plan-cursor'
import { toName, toNames, toNext, toUnique } from '@db/client-compiler-plan-name'
import type { Code, Event, Snap } from '@db/client-share'

const _IDLE = { sel: null, edit: null }

const _show = (snap: Snap, page: string, top: number, patch: object = {}): Code[] => [
        ['state', { page, top, ...patch }],
        ['send', { type: 'window', id: snap.id, page, top, size: ROWS }],
]

const _write = (snap: Snap, text: string, marks: any[][]): Code[] => {
        const target = toTarget(snap)
        if (!target || target.row === 0) return []
        return [['send', { type: 'cell', id: snap.id, page: snap.page, row: target.row, col: target.col, text, marks }]]
}

const _style = (snap: Snap, row: number, index: number, name: string, value: string | null): Code[] => {
        if (!snap.cols[index]) return []
        return [['send', { type: 'style', id: snap.id, page: snap.page, row, col: snap.cols[index][0], name, value }]]
}

const _commit = (snap: Snap): Code[] => {
        const target = toTarget(snap)
        const { edit, page } = snap
        if (!edit || !target) return []
        const isSame = edit.text === toText(snap) && JSON.stringify(edit.marks) === JSON.stringify(toMarks(snap))
        if (isSame) return []
        if (target.row === 0) return [['send', { type: 'col.name', page, col: target.col, name: edit.text }]]
        return _write(snap, edit.text, edit.marks)
}

const _PLANS: Record<string, (event: Event, snap: Snap) => Code[]> = {
        boot: (_, snap) => (!snap.page && snap.pages.length ? _show(snap, snap.pages[0], 1) : []),
        sync: (_, snap) => (snap.page ? _show(snap, snap.page, snap.top) : []),
        page: ({ page }, snap) => [..._commit(snap), ..._show(snap, page, 1, _IDLE)],
        pick: ({ slot, index }, snap) => [..._commit(snap), ['state', { sel: [slot, index], edit: null, note: '' }]],
        edit: ({ text }, snap) => {
                if (!toTarget(snap)) return []
                return [['state', { edit: { text: text ?? toText(snap), marks: text === undefined ? toMarks(snap) : [], start: 0, stop: 0 } }]]
        },
        type: ({ text, start, stop }, snap) => (snap.edit ? [['state', { edit: { ...snap.edit, text, start, stop } }]] : []),
        commit: ({ dx, dy }, snap) => [..._commit(snap), ['state', { edit: null, sel: toMoved(snap, dx, dy) }]],
        cancel: () => [['state', { edit: null }]],
        clear: (_, snap) => (toText(snap) ? _write(snap, '', []) : []),
        move: ({ dx, dy }, snap) => {
                const slot = snap.sel?.[0] ?? 0
                const isDown = dy > 0 && slot === ROWS - 1
                const isUp = dy < 0 && slot === 0 && snap.top > 1
                if (isDown || isUp) return _PLANS.scroll({ type: 'scroll', dy }, snap)
                return [['state', { sel: toMoved(snap, dx, dy) }]]
        },
        scroll: ({ dy }, snap) => {
                const top = dy > 0 ? (snap.rows[dy]?.[0] ?? snap.top) : Math.max(1, snap.top + dy)
                const isEnd = dy > 0 && snap.rows.length < ROWS
                if (isEnd || !snap.page || top === snap.top) return []
                return _show(snap, snap.page, top)
        },
        add: ({ kind }, snap) => {
                const page = toNext('ページ', snap.pages)
                const col = toNext('列', snap.cols.map(([name]) => name))
                if (kind === 'page') return [['send', { type: 'page.add', page }], ..._show(snap, page, 1, _IDLE)]
                if (kind === 'col') return [['send', { type: 'col.add', page: snap.page, col }]]
                return [['send', { type: 'row.add', page: snap.page }], ..._show(snap, snap.page, Math.max(1, snap.last + 2 - ROWS))]
        },
        remove: ({ kind }, snap) => {
                const target = toTarget(snap)
                const rest = snap.pages.filter((page) => page !== snap.page)
                if (kind === 'page') return rest.length ? [['send', { type: 'page.del', page: snap.page }], ..._show(snap, rest[0], 1, _IDLE)] : []
                if (!target) return []
                if (kind === 'col') return [['send', { type: 'col.del', page: snap.page, col: target.col }], ['state', _IDLE]]
                return target.row ? [['send', { type: 'row.del', page: snap.page, row: target.row }], ['state', _IDLE]] : []
        },
        resize: ({ index, width }, snap) => _style(snap, 0, index, 'width', String(Math.max(1, Math.min(WIDE, width)))),
        fill: ({ value }, snap) => {
                const target = toTarget(snap)
                return target?.row ? _style(snap, target.row, target.index, 'fill', value || null) : []
        },
        bold: (_, snap) => {
                const { edit } = snap
                if (edit && edit.start < edit.stop) return [['state', { edit: { ...edit, marks: toToggled(edit.marks, edit.start, edit.stop) } }]]
                if (edit) return []
                return _write(snap, toText(snap), toToggled(toMarks(snap), 0, toText(snap).length))
        },
        load: ({ name, names, rows }, snap) => {
                const page = toUnique(toName(name) || 'ページ', snap.pages)
                const cols = toNames(names)
                const count = Math.max(1, Math.ceil(rows.length / BATCH))
                const sends = Array.from({ length: count }, (_, part): Code => ['send', { type: 'import', page, names: cols, rows: rows.slice(part * BATCH, (part + 1) * BATCH) }])
                return cols.length ? [...sends, ..._show(snap, page, 1, _IDLE)] : []
        },
        undo: (_, snap) => [['send', { type: 'undo', id: snap.id }]],
        redo: (_, snap) => [['send', { type: 'redo', id: snap.id }]],
        save: () => [['send', { type: 'save' }]],
        open: () => [['send', { type: 'open' }], ['state', { page: '', ..._IDLE }]],
        sql: ({ text }) => [['send', { type: 'sql', text }, 'result']],
}

export const plan = (event: Event | null, snap: Snap): Code[] => {
        if (!event || !Object.hasOwn(_PLANS, event.type)) return []
        return _PLANS[event.type](event, snap)
}
