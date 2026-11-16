import { twinOf } from '@db/test-share'
import { ZERO, isOk, key } from './code.ts'
import type { Consts, Facts, Stat } from '@db/test-share'
import type { Draft } from './code.ts'

const _IDLE = { get: 0, put: 0, delete: 0, calls: 0, bytes: 0, image: 0, delta: 0, wrote: 0, fail: 0, after: 0, faults: [] as string[] }

const _cut = (value: number, cuts: [number, string][]) => cuts.find(([max]) => value <= max)![1]

export const openOf = (f: Facts) => f.alive.filter((name) => /^[A-H]$/.test(name) && f.reg[key(name, 'open')])

export const isFresh = (reg: Record<string, any>, node: string) => reg.writer === null || reg.writer === node || reg.stamp <= (reg[key(node, 'seen')] ?? 0)

export const knownOf = (f: Facts, node: string) => {
        if (!isFresh(f.reg, node) || f.reg.torn) return '001'
        if (f.reg[key(node, 'after')]) return '003'
        if (f.reg[key(node, 'limbo')]) return '007'
        return ''
}

export const canPush = (stat: Stat, K: Consts) => stat.base > K.CHUNK && stat.deltas < K.SLOTS && stat.patch + stat.dirty < K.CHUNK && stat.dirty > 0

export const regionsOf = (f: Facts, stat: Stat, seqs: number[], node = '') => [
        `chunks:${_cut(Math.ceil(stat.base / f.K.CHUNK), [[1, '1'], [f.K.ROOM, '2-ROOM'], [Infinity, 'ROOM+']])}`,
        `deltas:${_cut(stat.deltas, [[0, '0'], [2, '1-2'], [4, '3-4'], [Infinity, '5-SLOTS']])}`,
        `load:${_cut(stat.patch + stat.dirty, [[0, '0'], [f.K.CHUNK / 2, 'low'], [Infinity, 'high']])}`,
        `residue:${seqs.some((seq) => seq > stat.deltas) ? '1+' : '0'}`,
        `writers:${Math.max(1, new Set([...openOf(f), ...(node ? [node] : [])]).size)}`,
]

export const seen = ({ node, facts }: Draft) => {
        const { K, reg } = facts
        const twin = twinOf(node)
        const out = reg[key(node, 'out')]
        const stat: Stat = reg[key(node, 'stat')] ?? ZERO
        const io: typeof _IDLE = reg[key(node, 'io')] ?? _IDLE
        const seqs: number[] = reg.seqs?.seqs ?? []
        const ratio = stat.base > 0 ? (reg.seqs?.image ?? 0) / (stat.base * K.PAGE) : 1
        const at = (name: string) => reg[key(node, name)]
        return { K, reg, twin, out, stat, io, seqs, ratio, at, isDone: isOk(out), isSync: !!at('sync'), isOpen: !!at('open'), isFresh: isFresh(reg, node), known: knownOf(facts, node) }
}

export type View = ReturnType<typeof seen>
