import * as Y from 'yjs'
import { rowKey } from './utils/keys/keys.ts'
import { isSame } from './utils/tree/tree.ts'
import type { Pair, Tree } from './utils/share/types.ts'
import type { Queried, Row, Value } from '../utils/share/types.ts'

const pairsAt = (tree: Tree, id: number) => tree.get(rowKey(id)) as Y.Array<Pair> | undefined

const namesOf = (pairs: Pair[]) => pairs.map(([name]) => name)

export const idOf = (row: Row) => row._id as number

export const rowsOf = (res: Queried) => res.rows.map((values) => Object.fromEntries(res.cols.flatMap((col, i) => (values[i] === null ? [] : [[col, values[i]]]))) as Row)

export const readRow = (tree: Tree, id: number): Row | undefined => {
        const pairs = pairsAt(tree, id)
        if (!pairs) return
        return Object.fromEntries(pairs.toArray())
}

export const writeCell = (tree: Tree, id: number, col: string, value: Value) => {
        const pairs = pairsAt(tree, id)
        if (!pairs) return
        const i = namesOf(pairs.toArray()).indexOf(col)
        if (i < 0) return pairs.push([[col, value]])
        if (pairs.get(i)[1] === value) return
        pairs.delete(i, 1)
        pairs.insert(i, [[col, value]])
}

export const writeRow = (tree: Tree, row: Row) => {
        const id = idOf(row)
        const next = Object.entries(row)
        const pairs = pairsAt(tree, id)
        const isKept = !!pairs && isSame(namesOf(pairs.toArray()), namesOf(next))
        if (!isKept) return tree.set(rowKey(id), Y.Array.from(next))
        next.forEach(([col, value]) => writeCell(tree, id, col, value))
}

export const inWindow = (tree: Tree, rows: number[]) => rows.filter((row) => tree.has(rowKey(row)))
