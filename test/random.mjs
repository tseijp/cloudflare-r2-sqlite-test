import * as prng from 'lib0/prng'

export const createRandom = (seed) => {
        const gen = prng.create(seed)
        const real = () => prng.real53(gen)
        const int = (min, max) => prng.int32(gen, min, max)
        const pick = (list) => list[int(0, list.length - 1)]
        const weighted = (table) => ((at) => table.find(([, w]) => (at -= w) < 0)?.[0] ?? table.at(-1)[0])(real() * table.reduce((sum, [, w]) => sum + w, 0))
        return { real, int, pick, weighted, chance: (p) => real() < p, some: (list, max) => Array.from({ length: int(0, max) }, () => pick(list)) }
}
