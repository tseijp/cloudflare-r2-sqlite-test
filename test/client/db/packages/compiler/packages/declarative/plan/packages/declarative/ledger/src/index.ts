import { bounds } from './bounds.ts'
import { axes, cost, failures, merge } from './score.ts'
import type { Code, Run, Spec, Tally } from '@test/client-share'

type Bag = Record<string, number>

const _count = (keys: string[]) => merge(keys.map((key) => ({ [key]: 1 })))

// 走らせた結果 → 台帳 (score.md 9 節) を書く命令の列
export const ledger = (spec: Spec): Code[] => {
        const runs = [...(spec.runs as Run[])].sort((left, right) => left.seed - right.seed)
        const limits = spec.limits as Bag
        const tallies = runs.map((run) => run.tally).filter((tally): tally is Tally => !!tally)
        const reached = merge(tallies.map((tally) => tally.regions))
        const scored = axes(tallies)
        const broken = failures(runs)
        const idle = Object.keys(scored).filter((axis) => !scored[axis].judged)
        const spent = runs.reduce((total, run) => total + run.seconds, 0)
        const book = {
                at: spec.at,
                spec: { seeds: spec.seeds, scenarios: runs.length, settings: spec.settings },
                bounds: bounds(limits, spec.settings),
                regions: reached,
                axes: scored,
                score: Object.values(scored).reduce((total, axis) => total + axis.point, 0),
                cost: cost(tallies),
                known: _count(broken.filter((failure) => failure.known).map((failure) => failure.known)),
                failures: broken,
                store: merge(tallies.map((tally) => tally.store)),
                unmeasured: {
                        axes: idle,
                        regions: Object.keys(reached).filter((key) => !reached[key]),
                        judgments: merge(tallies.map((tally) => tally.unmeasured)),
                        scenarios: runs.filter((run) => !run.tally).map((run) => run.file),
                },
                seconds: { wall: spec.seconds, scenarios: Math.round(spent) },
        }
        return [['open', spec.file], ['line', JSON.stringify(book, null, 8)], ['close']]
}
