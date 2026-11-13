type Test<T> = (items: T[]) => Promise<boolean>

// 列を、ほぼ同じ長さの size 個に分ける
const _split = <T>(items: T[], size: number) => {
        const length = Math.ceil(items.length / size)
        const count = Math.ceil(items.length / length)
        return Array.from({ length: count }, (_, index) => items.slice(index * length, (index + 1) * length))
}

// 崩れが残る最短の列を探す (delta debugging)。列を size 個に分け、1 つずつ外して崩れが残れば、外したままにする。
// 残らなければ分け方を細かくする。試行が budget 回に達したら、その時点の列を返す
export const reduce = async <T>(items: T[], isFailing: Test<T>, budget: number) => {
        let [kept, size, left] = [items, 2, budget]
        while (kept.length > 1 && left > 0) {
                const parts = _split(kept, size)
                let next: T[] | null = null
                for (let index = 0; index < parts.length && left > 0 && !next; index++) {
                        const rest = parts.filter((_, other) => other !== index).flat()
                        left--
                        if (await isFailing(rest)) next = rest
                }
                if (!next && size >= kept.length) break
                size = next ? Math.max(2, size - 1) : Math.min(kept.length, size * 2)
                kept = next ?? kept
        }
        return kept
}
