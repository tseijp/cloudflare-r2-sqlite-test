import { act, cell, client, fresh, row, sheet, token } from './draft.ts'
import { BAD, COLS, PAGES, READS, STYLES, WRITES } from './pool.ts'
import type { Draft, Move, Sheet } from './draft.ts'

const _swap = (name: string) => (name === name.toUpperCase() ? name.toLowerCase() : name.toUpperCase())

// 範囲の外の窓の大きさ、行番号、装飾の名前
const _WINDOW = { type: 'window', id: 'u1', top: 0 }

const _CELL = { type: 'cell', id: 'u1', row: -1, text: 'x', marks: [] }

const _STYLE = { type: 'style', id: 'u1', row: 1, name: 'bad name', value: 'x' }

// 制約の外の命令 (contract.md 5 節)。compile が例外を投げるはずのもの
const _INVALID: ((draft: Draft, target: Sheet) => unknown)[] = [
        (draft) => ({ type: 'page.add', page: draft.dice.pick(BAD) }),
        (draft, { name }) => ({ type: 'col.add', page: name, col: draft.dice.pick(BAD) }),
        (draft, { name, cols }) => ({ type: 'col.name', page: name, col: cols[0], name: draft.dice.pick(BAD) }),
        (draft, { name }) => ({ ..._WINDOW, page: name, size: draft.dice.pick([0, 201, 1.5]) }),
        (_draft, { name }) => ({ ..._WINDOW, id: 'bad id!', page: name, size: 30 }),
        (_draft, { name, cols }) => ({ ..._CELL, page: name, col: cols[0] }),
        (_draft, { name, cols }) => ({ ..._STYLE, page: name, col: cols[0] }),
        () => ({ type: 'undo', id: '' }),
        () => ({ type: 'nope' }),
]

const _add = (draft: Draft) => {
        const name = fresh(draft, PAGES, draft.sheets.map((item) => item.name))
        const col = draft.dice.pick(COLS)
        act(draft, 'run', { type: 'page.add', page: name })
        act(draft, 'run', { type: 'col.add', page: name, col })
        draft.sheets.push({ name, cols: [col], rows: 0 })
}

// 利用者と LLM の命令。種類 → scenario に足す手
export const edits: Record<string, Move> = {
        cell: (draft) => {
                const target = sheet(draft)
                act(draft, 'run', cell(draft, target, row(draft, target)))
        },
        style: (draft) => {
                const { dice } = draft
                const target = sheet(draft)
                const value = dice.weigh([[3, token(draft)], [2, 'red'], [1, null], [1, '6']])
                const at = { page: target.name, row: row(draft, target), col: dice.pick(target.cols) }
                draft.last = client(draft)
                act(draft, 'run', { type: 'style', id: draft.last, ...at, name: dice.pick(STYLES), value })
        },
        // 直前に編集した client の undo を主に選ぶ
        undo: (draft) => act(draft, 'run', { type: 'undo', id: draft.dice.isHit(0.8) ? draft.last : client(draft) }),
        redo: (draft) => act(draft, 'run', { type: 'redo', id: draft.dice.isHit(0.8) ? draft.last : client(draft) }),
        rowAdd: (draft) => {
                const target = sheet(draft)
                act(draft, 'run', { type: 'row.add', page: target.name })
                target.rows++
        },
        rowDel: (draft) => {
                const target = sheet(draft)
                act(draft, 'run', { type: 'row.del', page: target.name, row: row(draft, target) })
        },
        colAdd: (draft) => {
                const target = sheet(draft)
                const col = fresh(draft, COLS, target.cols)
                act(draft, 'run', { type: 'col.add', page: target.name, col })
                target.cols.push(col)
        },
        // 全 leaf を書き直す。最後の 1 列は消さない
        colDel: (draft) => {
                const target = sheet(draft)
                const col = draft.dice.pick(target.cols)
                if (target.cols.length < 2) return edits.colAdd(draft)
                act(draft, 'run', { type: 'col.del', page: target.name, col })
                target.cols = target.cols.filter((name) => name !== col)
        },
        // 新しい名前、今と同じ名前、大文字小文字だけ違う名前
        colName: (draft) => {
                const target = sheet(draft)
                const col = draft.dice.pick(target.cols)
                const name = draft.dice.weigh([[3, fresh(draft, COLS, target.cols)], [1, col], [1, _swap(col)]])
                act(draft, 'run', { type: 'col.name', page: target.name, col, name })
                target.cols = target.cols.map((item) => (item === col ? name : item))
        },
        pageAdd: _add,
        // 最初の page (大きい table) は消さない
        pageDel: (draft) => {
                const target = draft.dice.pick(draft.sheets.slice(1))
                if (!target) return _add(draft)
                act(draft, 'run', { type: 'page.del', page: target.name })
                draft.sheets = draft.sheets.filter((item) => item !== target)
        },
        load: (draft) => {
                const { dice } = draft
                const target = sheet(draft)
                const count = dice.int(1, 40)
                act(draft, 'load', target.name, target.cols, count, dice.pick([8, 40, 300]), ++draft.serial)
                target.rows += count
        },
        // 大きい table に、数十 〜 数百 page ぶんの行を 1 回で足す。1 行は半 page ほど
        grow: (draft) => {
                const [target] = draft.sheets
                const count = draft.dice.pick([150, 400, 900])
                act(draft, 'load', target.name, target.cols, count, { $code: 'db.PAGE / 2 - 48' }, ++draft.serial)
                target.rows += count
        },
        window: (draft) => {
                const { dice } = draft
                const target = sheet(draft)
                const view = { page: target.name, top: dice.int(0, target.rows + 2), size: dice.pick([1, 30, 200]) }
                act(draft, 'run', { type: 'window', id: client(draft), ...view })
        },
        leave: (draft) => act(draft, 'run', { type: 'leave', id: client(draft) }),
        // 読み取りの sql。page 名に " があるときは、system table を読む
        read: (draft) => {
                const { name } = sheet(draft)
                const text = draft.dice.pick(READS)
                const last = READS[READS.length - 1]
                act(draft, 'run', { type: 'sql', text: name.includes('"') ? last : text.replace('%s', name) })
        },
        refuse: (draft) => act(draft, 'reject', { type: 'sql', text: draft.dice.pick(WRITES) }),
        invalid: (draft) => act(draft, 'invalid', draft.dice.pick(_INVALID)(draft, sheet(draft))),
        // save の式に依らず、physical な push か merge を直接送る
        direct: (draft) => {
                const target = draft.sheets[0]
                act(draft, 'run', cell(draft, target, row(draft, target)))
                act(draft, draft.dice.isHit(0.7) ? 'push' : 'merge')
        },
        // 上限を超える取込。reject を期待する。database が上限の手前にあるときだけ選ぶ
        over: (draft) => {
                const [target] = draft.sheets
                const [count, size] = [{ $code: 'db.CHUNK * 2' }, { $code: 'db.PAGE - 96' }]
                act(draft, 'load', target.name, target.cols, count, size, ++draft.serial, 1)
        },
}
