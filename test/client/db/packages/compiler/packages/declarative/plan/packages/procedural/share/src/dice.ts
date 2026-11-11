export interface Dice {
        next(): number
        int(from: number, to: number): number
        pick<T>(list: T[]): T
        isHit(rate: number): boolean
        weigh<T>(table: [number, T][]): T
}

// seed から作る擬似乱数 (mulberry32)。同じ seed は同じ列を返す。時刻と Math.random は使わない
export const createDice = (seed: number): Dice => {
        let _state = seed >>> 0
        const next = () => {
                _state = (_state + 0x6d2b79f5) >>> 0
                const mixed = Math.imul(_state ^ (_state >>> 15), _state | 1)
                const value = mixed ^ (mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61))
                return ((value ^ (value >>> 14)) >>> 0) / 4294967296
        }
        const int = (from: number, to: number) => from + Math.floor(next() * (to - from + 1))
        return {
                next,
                int,
                pick: (list) => list[int(0, list.length - 1)],
                isHit: (rate) => next() < rate,
                // 重みに比例して 1 つ選ぶ
                weigh: (table) => {
                        let rest = next() * table.reduce((total, [weight]) => total + weight, 0)
                        return (table.find(([weight]) => (rest -= weight) < 0) ?? table[table.length - 1])[1]
                },
        }
}
