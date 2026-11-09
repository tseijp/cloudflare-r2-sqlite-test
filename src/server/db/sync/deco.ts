import { decoKey } from './utils/keys/keys.ts'
import { put } from './utils/tree/tree.ts'
import type { Queried } from '../utils/share/types.ts'
import type { Deco, Tree } from './utils/share/types.ts'

const EMPTY: Deco = { styles: {}, marks: {} }

export const decoAt = (tree: Tree, row: number): Deco => tree.get(decoKey(row)) ?? EMPTY

export const putDeco = (tree: Tree, row: number, deco: Deco) => {
        const isEmpty = !Object.keys(deco.styles).length && !Object.keys(deco.marks).length
        if (isEmpty) return tree.delete(decoKey(row))
        put(tree, decoKey(row), deco)
}

export const without = <T>(map: Record<string, T>, key: string, value: T | null | undefined) => {
        const next = { ...map }
        delete next[key]
        if (value) next[key] = value
        return next
}

export const decosOf = (res: Queried) => {
        const map = new Map<number, Deco>()
        const at = (row: number) => map.get(row) ?? map.set(row, { styles: {}, marks: {} }).get(row)!
        res.styles.forEach((s) => void (at(s.row).styles[s.col] = s.json))
        res.marks.forEach((m) => (at(m.row).marks[m.col] ??= []).push({ from: m.from, to: m.to, attr: m.attr, val: m.val }))
        return (row: number) => map.get(row) ?? EMPTY
}
