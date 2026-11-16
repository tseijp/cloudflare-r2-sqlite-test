import { MAIN, PROBE } from '@db/test-share'
import type { Code, Facts, Stat, Step } from '@db/test-share'

export interface Draft {
        kind: string
        node: string
        args: any[]
        facts: Facts
        pre: Code[]
        act: Code[]
        post: Code[]
        rule: Code[]
}

const _BATCH = 10000

const _LIST = `select "name", "sql" from "sqlite_master" where "type" = 'table' order by "name"`

const _ROWS = `select * from {table} limit ${_BATCH} offset {offset}`

const _BILL = { get: 0, put: 0, bytes: 0, fGet: 0, fPut: 0, fPages: 0, wGet: 0, wPut: 0, wPages: 0, ratio: 1, base: 0, deltas: 0, patch: 0, dirty: 0, pages: 0, isChange: false }

export const ZERO: Stat = { pages: 0, base: 0, dirty: 0, deltas: 0, patch: 0 }

export const WRITES = ['page.add', 'page.del', 'row.add', 'row.del', 'col.add', 'col.del', 'col.name', 'cell', 'style', 'import', 'undo', 'redo']

export const key = (node: string, name: string) => `${node}.${name}`

export const json = (value: any) => JSON.stringify(value ?? null)

export const isOk = (out: any) => !!out && !('error' in out)

export const isSame = (a: any, b: any) => json(a) === json(b)

export const set = (name: string, value: any): Code => ['set', name, json(value)]

export const check = (axis: string, isPass: boolean, note: string, known = ''): Code => ['check', axis, isPass ? 1 : 0, note, known]

export const next = (step: Step): Code => ['then', json(step)]

export const ret = (value: any): Code => ['ret', json(value), '$ret']

export const bill = (kind: string, part: object): Code => ['bill', kind, json({ ..._BILL, ...part })]

export const count = (f: Facts, name: string, keys: string[]): Code => {
        const all: Record<string, number> = { ...(f.reg[name] ?? {}) }
        for (const one of keys) all[one] = (all[one] ?? 0) + 1
        return set(name, all)
}

export const call = (f: Facts, node: string, via: string, payload: any): Code[] => {
        const out = key(node, 'out')
        if (!f.isArmed) return [['call', node, via, json(payload), out]]
        return [set(out, null), ['cast', node, via, json(payload), out], ['park', node, 'parked']]
}

export const digest = (node: string, out: string): Code => ['digest', node, _LIST, _ROWS, _BATCH, out]

export const probe = (f: Facts): Code[] => [
        ['fork', MAIN, PROBE, null],
        ...(f.alive.includes(PROBE) ? [] : ([['boot', PROBE, PROBE]] as Code[])),
        ['call', PROBE, 'run', json({ type: 'open' }), 'P.out'],
        ['call', PROBE, 'execute', json([['sql', 'pragma integrity_check', []]]), 'P.fit'],
        digest(PROBE, 'P.sum'),
        ['stat', PROBE, 'P.stat'],
]
