import { pageHashes, tablesOf, walkPages } from './image.mjs'

export const ownersOf = (img) => {
        const owner = new Map()
        walkPages(img, 1, (pgno) => owner.set(pgno, 'sqlite_schema'))
        for (const t of tablesOf(img)) if (t.rootpage > 0) walkPages(img, t.rootpage, (pgno) => owner.set(pgno, t.name))
        return owner
}

export const changedOwners = (before, after) => {
        const owner = ownersOf(after)
        const a = pageHashes(before)
        const b = pageHashes(after)
        const out = {}
        for (let k = 0; k < Math.max(a.length, b.length); k++) {
                if (a[k] === b[k]) continue
                const name = owner.get(k + 1) ?? (k >= a.length ? '追加 (overflow か空き)' : 'overflow か空き')
                out[name] = (out[name] ?? 0) + 1
        }
        return out
}
