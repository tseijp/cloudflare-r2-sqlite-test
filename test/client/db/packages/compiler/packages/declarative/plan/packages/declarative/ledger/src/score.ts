import type { Bill, Run, Tally } from '@test/client-share'

type Bag = Record<string, number>

const _round = (value: number) => Math.round(value * 1000) / 1000

const _sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

// 比の最小、中央、最大
const _spread = (values: number[]) => {
        const sorted = values.filter(Number.isFinite).sort((left, right) => left - right)
        const [min, median, max] = [sorted[0], sorted[sorted.length >> 1], sorted[sorted.length - 1]].map(_round)
        return sorted.length ? { min, median, max } : null
}

export const merge = (bags: Bag[]) => {
        const total: Bag = {}
        for (const bag of bags) for (const [key, value] of Object.entries(bag)) total[key] = (total[key] ?? 0) + value
        return total
}

const _point = (judged: number, clean: number, share: number) => {
        return { judged, clean, point: judged ? Math.floor(share * 100) : 0, note: judged ? '' : '未計測' }
}

// score.md 6 節。その軸を判定した scenario のうち、崩れが 0 件だった scenario の割合
const _axis = (tallies: Tally[], axis: string) => {
        const judged = tallies.filter((tally) => tally.judged[axis] > 0)
        const clean = judged.filter((tally) => !tally.failures.some((failure) => failure.axis === axis))
        return _point(judged.length, clean.length, clean.length / judged.length)
}

// 式の軸。scenario ごとの「式の値 ÷ 観測 (1 を超えたら 1)」の平均
const _formula = (tallies: Tally[]) => {
        const bills = tallies.map((tally) => tally.cost).filter((bill) => bill.observed > 0)
        const ratios = bills.map((bill) => Math.min(1, bill.formula / bill.observed))
        return _point(ratios.length, ratios.filter((ratio) => ratio === 1).length, _sum(ratios) / ratios.length)
}

// 軸の名前は、scenario の記録の judged の key から得る。式の軸だけは、費用の比から点を出す
const _SCORES: Record<string, (tallies: Tally[]) => unknown> = { 式: _formula }

const _names = (tallies: Tally[]) => Object.keys(merge(tallies.map((tally) => tally.judged)))

export const axes = (tallies: Tally[]) =>
        Object.fromEntries(_names(tallies).map((axis) => [axis, _SCORES[axis]?.(tallies) ?? _axis(tallies, axis)]))

// scenario の image の大きさの領域。到達が最も多い chunk の区切り
const _layer = ({ regions }: Tally) => {
        const keys = Object.keys(regions).filter((key) => key.startsWith('chunk/'))
        return keys.sort((left, right) => regions[right] - regions[left])[0] ?? 'chunk/none'
}

// 1 つの領域の費用。観測、式、丸ごと保存、最良、SQL の読みの合計と、scenario ごとの比の最小、中央、最大
const _row = (bills: Bill[]) => {
        const total = (key: keyof Bill) => _round(_sum(bills.map((bill) => bill[key])))
        const sums = Object.fromEntries((Object.keys(bills[0]) as (keyof Bill)[]).map((key) => [key, total(key)]))
        const ratio = {
                formula: _spread(bills.map((bill) => bill.formula / bill.observed)),
                whole: _spread(bills.map((bill) => bill.observed / bill.whole)),
                best: _spread(bills.map((bill) => (bill.observed - bill.reads) / bill.best)),
        }
        return { scenarios: bills.length, ...sums, ratio }
}

// 領域ごとの費用。比は、式 ÷ 観測、観測 ÷ 丸ごと保存、(観測 − 読み) ÷ 最良
export const cost = (tallies: Tally[]) => {
        const layers = [...new Set(tallies.map(_layer))].sort()
        const bills = (layer: string) => tallies.filter((tally) => _layer(tally) === layer).map((tally) => tally.cost)
        return Object.fromEntries(layers.map((layer) => [layer, _row(bills(layer))]))
}

const _brief = (value: unknown) => (JSON.stringify(value) ?? 'undefined').slice(0, 300)

// 崩れた判定ごとに、seed、軸、scenario の file、期待した値、観測した値。走り切らなかった scenario も 1 件にする
export const failures = (runs: Run[]) =>
        runs.flatMap((run) => {
                const where = { seed: run.seed, file: run.fail || run.file }
                const died = { ...where, axis: '実行', label: run.limit ? 'timeout' : 'crash', known: '' }
                if (!run.tally) return [{ ...died, expected: 'exit 0', observed: `exit ${run.code}` }]
                return run.tally.failures.map(({ axis, label, known, expected, observed }) => {
                        return { ...where, axis, label, known, expected: _brief(expected), observed: _brief(observed) }
                })
        })
