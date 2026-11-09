import type { Tree } from '../share/types.ts'

export const uid = () => Math.random().toString(36).slice(2, 10)

export const isSame = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export const put = (tree: Tree, key: string, value: unknown) => {
        if (isSame(tree.get(key), value)) return
        tree.set(key, value)
}

export const keysOf = (tree: Tree, isMatch: (key: string) => boolean) => [...tree.keys()].filter(isMatch)

export const byPos = <T extends { pos: number }>(a: T, b: T) => a.pos - b.pos
