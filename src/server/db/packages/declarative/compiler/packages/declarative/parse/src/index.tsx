import { toOp } from '@db/server-compiler-share'
import { isCount, isMarks, isName, isNames, isQuery, isRows, isSpan, isText, isWord } from '@db/server-compiler-parse-check'
import type { Op } from '@db/server-share'

const _SHAPES: Record<string, Record<string, (value: any) => boolean>> = {
        open: {},
        save: {},
        'page.add': { page: isName },
        'page.del': { page: isName },
        'row.add': { page: isName },
        'row.del': { page: isName, row: isCount },
        'col.add': { page: isName, col: isName },
        'col.del': { page: isName, col: isName },
        'col.name': { page: isName, col: isName, name: isName },
        cell: { id: isWord, page: isName, row: isCount, col: isName, text: isText, marks: isMarks },
        style: { id: isWord, page: isName, row: isCount, col: isName, name: isWord, value: isText },
        window: { id: isWord, page: isName, top: isCount, size: isSpan },
        import: { page: isName, names: isNames, rows: isRows },
        undo: { id: isWord },
        redo: { id: isWord },
        sql: { text: isQuery },
        leave: { id: isWord },
}

const _pick = (op: Op): Op => {
        if (!Object.hasOwn(_SHAPES, op.type)) throw new Error(`unknown op: ${op.type}`)
        const shape = _SHAPES[op.type]
        const bad = Object.keys(shape).find((key) => !shape[key](op[key]))
        if (bad) throw new Error(`invalid ${op.type}.${bad}`)
        return Object.fromEntries([['type', op.type], ...Object.keys(shape).map((key) => [key, op[key]])])
}

export const parse = (op: Op): Op => {
        if (op.type === 'echo') return { ..._pick(toOp(op.key, op.value)), isEcho: true }
        return _pick(op)
}
