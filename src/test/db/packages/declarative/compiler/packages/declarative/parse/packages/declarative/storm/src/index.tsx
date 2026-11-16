import { OPS, intOf, pickOf, roll } from '@db/test-compiler-parse-share'
import type { Step } from '@db/test-share'
import type { Region, Script } from '@db/test-compiler-share'

type Event = (region: Region, at: number) => Step[]

const _FAULTS = ['get', 'put', 'put.after', 'delete']

const _SPOTS = [0.3, 0.6, 0.9]

const _TAIL: Step[] = [['save', 'A'], ['audit', 'A'], ['stop', 'A'], ['open', 'A'], ['audit', 'A']]

const _edit = (region: Region, at: number, node = 'A'): Step => ['run', node, OPS.cell(region, at)]

const _CRASH: Event[] = [
        (region, at) => [_edit(region, at), ['stop', 'A'], ['open', 'A']],
        (region, at) => [_edit(region, at), ['hold', 'put', -1], ['save', 'A'], ['stop', 'A'], ['release', 'arrive'], ['open', 'A']],
        (region, at) => [_edit(region, at), ['hold', 'put', -1], ['save', 'A'], ['stop', 'A'], ['release', 'lose'], ['open', 'A']],
]

const _RIVAL: Event[] = [
        (region, at) => [_edit(region, at), ['hold', 'put', -1], ['save', 'A'], ['open', 'B'], _edit(region, at + 1, 'B'), ['save', 'B'], ['release', 'arrive'], ['stop', 'B'], ['stop', 'A'], ['open', 'A']],
        (region, at) => [['open', 'B'], _edit(region, at + 1, 'B'), ['save', 'B'], _edit(region, at), ['save', 'A'], ['stop', 'B'], ['stop', 'A'], ['open', 'A']],
]

const _EVENT: Record<string, Event> = {
        calm: () => [],
        crash: (region, at) => pickOf(roll(region.seed, at, 'crash'), _CRASH)(region, 5000 + at),
        fault: (region, at) => [
                ['fail', pickOf(roll(region.seed, at, 'fault'), _FAULTS), intOf(roll(region.seed, at, 'nth'), 0, 2), -1],
                _edit(region, 5000 + at),
                ['save', 'A'],
                _edit(region, 5001 + at),
                ['save', 'A'],
                ['stop', 'A'],
                ['open', 'A'],
                ['open', 'A'],
        ],
        rival: (region, at) => pickOf(roll(region.seed, at, 'rival'), _RIVAL)(region, 5000 + at),
        chain: (region, at) => [
                ...Array.from({ length: 8 }).flatMap((_, k): Step[] => [_edit(region, 5000 + at * 10 + k), ['push', 'A']]),
                ['fail', 'delete', 0, -1],
                _edit(region, 5009 + at * 10),
                ['merge', 'A'],
                ['stop', 'A'],
                ['open', 'A'],
        ],
}

export const storm = ({ region, turns }: Script): Script => {
        const spots = _SPOTS.map((part) => 2 + Math.floor((turns.length - 2) * part))
        const body = turns.flatMap((turn, at) => (spots.includes(at) ? [_EVENT[region.event](region, at), turn] : [turn]))
        return { region, turns: [...body, _TAIL] }
}
