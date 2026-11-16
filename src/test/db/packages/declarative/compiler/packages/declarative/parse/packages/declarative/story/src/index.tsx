import { OPS, intOf, nameOf, pickOf, roll, sessionOf, trioOf } from '@db/test-compiler-parse-share'
import type { Step } from '@db/test-share'
import type { Region, Script, Table } from '@db/test-compiler-share'

type Use = (region: Region) => Step[][]

const _MIB = 1048576

const _POLICY = { every: 56, idle: 70 }

const _CROWD = ['cell', 'cell', 'cell', 'style', 'window', 'undo', 'redo', 'trio', 'save', 'bad']

const _CHURN = ['cell', 'cell', 'style', 'style', 'rowAdd', 'rowDel', 'colAdd', 'save', 'audit', 'big']

const _run = (op: any): Step => ['run', 'A', op]

const _crowd = (region: Region, at: number): Step[] => {
        const kind = pickOf(roll(region.seed, at, 'kind'), _CROWD)
        if (kind === 'trio') return trioOf(region, at)
        if (kind === 'save') return [['save', 'A']]
        if (kind === 'bad') return [_run(OPS.bad(region, at)), ['expect', 'A', { axis: 'compile', error: true }]]
        return [_run(OPS[kind](region, at))]
}

const _churn = (region: Region, mine: Table[], at: number): Step[] => {
        const kind = pickOf(roll(region.seed, at, 'kind'), _CHURN)
        if (kind === 'save') return [['save', 'A']]
        if (kind === 'audit') return [['audit', 'A']]
        if (kind === 'big') return [_run(OPS.cell(region, at))]
        return [_run(OPS[kind](region, at, mine))]
}

const _USE: Record<string, Use> = {
        life: (region) => [[['policy', _POLICY]], ...Array.from({ length: Math.ceil(region.steps / 12) }).flatMap((_, at) => sessionOf(region, at))],
        crowd: (region) => [...region.clients.map((id, at) => [_run(OPS.window({ ...region, clients: [id] }, at))]), ...Array.from({ length: region.steps }, (_, at) => _crowd(region, at))],
        churn: (region) => {
                const page = nameOf(region, 1)
                const names = [2, 3, 4].map((at) => nameOf(region, at))
                const mine: Table[] = [{ file: '', bytes: 0, page, col: names[0], names, rows: 6 }]
                const last = region.tables[0]
                const head: Step[] = [
                        _run({ type: 'page.add', page }),
                        ...names.map((col) => _run({ type: 'col.add', page, col })),
                        ...Array.from({ length: 6 }, () => _run({ type: 'row.add', page })),
                ]
                const tail: Step[] = [
                        _run({ type: 'col.name', page, col: names[0], name: `${names[0]}x` }),
                        _run({ type: 'col.del', page, col: names[1] }),
                        ['audit', 'A'],
                        _run({ type: 'col.del', page: last.page, col: last.names[last.names.length - 1] }),
                        ['save', 'A'],
                        _run({ type: 'page.del', page }),
                ]
                return [...head.map((step) => [step]), ...Array.from({ length: region.steps }, (_, at) => _churn(region, mine, at)), ...tail.map((step) => [step])]
        },
        ingest: (region) => [
                ...Array.from({ length: Math.ceil(region.steps / 6) }, (_, at): Step[] => [
                        ['load', 'A', pickOf(roll(region.seed, at, 'file'), region.tables).file, intOf(roll(region.seed, at, 'bytes'), 65536, 2 * _MIB)],
                        _run(OPS.cell(region, at)),
                        ['save', 'A'],
                        _run(OPS.scan(region, at)),
                        ...(at % 3 === 2 ? ([['stop', 'A'], ['open', 'A']] as Step[]) : []),
                ]),
                ...(region.size === 2 ? ([[['load', 'A', region.tables[0].file, 16 * _MIB]], [['fill', 'A', region.tables[0].page, region.tables[0].names, 3000, 8000, region.seed, 3000]], [['save', 'A']]] as Step[][]) : []),
        ],
        scan: (region) =>
                Array.from({ length: Math.ceil(region.steps / 5) }, (_, at): Step[] => [
                        ['stop', 'A'],
                        ['open', 'A'],
                        _run(OPS.range(region, at)),
                        _run(OPS.scan(region, at)),
                        _run(OPS.range(region, at + 1000)),
                        ...(at % 4 === 3 ? ([_run(OPS.cell(region, at)), ['save', 'A']] as Step[]) : []),
                ]),
}

export const story = (region: Region): Script => {
        const { tables, deltas, patch, residue } = region
        const state = { tables: tables.map(({ file, bytes, page, col }) => ({ file, bytes, page, col })), deltas, patch, residue }
        return { region, turns: [[['state', state]], [['open', 'A']], ..._USE[region.use](region)] }
}
