import * as prng from 'lib0/prng'

export const createRandom = (seed) => {
        const gen = prng.create(seed)
        const real = () => prng.real53(gen)
        const int = (min, max) => prng.int32(gen, min, max)
        const chance = (p) => real() < p
        const pick = (list) => list[int(0, list.length - 1)]
        const weighted = (table) => {
                const total = table.reduce((sum, [, w]) => sum + w, 0)
                let at = real() * total
                for (const [item, w] of table) if ((at -= w) < 0) return item
                return table[table.length - 1][0]
        }
        const some = (list, max) => Array.from({ length: int(0, max) }, () => pick(list))
        return { real, int, chance, pick, weighted, some }
}
