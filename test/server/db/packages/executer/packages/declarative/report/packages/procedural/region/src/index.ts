import { FAULTS, MARKS } from '@test/server-share'
import type { Limits, Stat } from '@test/server-share'

// 値が入る区間の名前。edges は区間の上端
const _bucket = (value: number, edges: number[]) => {
        const index = edges.findIndex((edge) => value <= edge)
        const low = index > 0 ? edges[index - 1] + 1 : 0
        if (index < 0) return `${edges[edges.length - 1] + 1}+`
        return low < edges[index] && index > 0 ? `${low}-${edges[index]}` : `${edges[index]}`
}

// 本文と名前の種類 (score.md 3 節)
const _CLASSES: [string, (text: string | null, page: number) => boolean][] = [
        ['null', (text) => text === null],
        ['empty', (text) => text === ''],
        ['ascii', (text) => !!text && /^[\x21-\x7e]+$/.test(text)],
        ['japanese', (text) => !!text && /[぀-ヿ㐀-鿿]/.test(text)],
        ['space', (text) => !!text && /\s/.test(text)],
        ['symbol', (text) => !!text && /["'%_/]/.test(text)],
        ['long', (text, page) => !!text && text.length > page],
]

// 領域の区切り (区間の上端)。delta の数、patch + dirty、client の数。chunk 数の区切りは [1, ROOM]
const _DELTAS = [0, 2, 4]

const _LOADS = [0, 63, 255]

const _CLIENTS = [0, 1, 3]

// 区切りに依らない領域の名前
const _FIXED = ['delta/outside', 'restart/boundary', 'restart/midcall', 'instance/1', 'instance/2', 'fault/put.hold']

// 区切りから、領域の名前を全て並べる
const _names = (kind: string, edges: number[]) => {
        const names = [...edges.map((edge) => _bucket(edge, edges)), _bucket(Infinity, edges)]
        return names.map((name) => `${kind}/${name}`)
}

// 到達を数える領域の名前の全て。到達が 0 回のものを未計測として見せるために、先に並べる
export const every = (limits: Limits) => [
        ..._names('chunk', [1, limits.ROOM]),
        ..._names('delta', _DELTAS),
        ..._names('load', _LOADS),
        ..._names('client', _CLIENTS),
        ..._CLASSES.map(([name]) => `text/${name}`),
        ...FAULTS.map((kind) => `fault/${kind}`),
        ...MARKS,
        ..._FIXED,
]

// open か save の時点の領域。image の chunk 数、delta の数 (式の外なら outside)、patch + dirty
export const state = (limits: Limits, stat: Stat, isOutside: boolean) => {
        const chunk = `chunk/${_bucket(Math.ceil(stat.base / limits.CHUNK), [1, limits.ROOM])}`
        const delta = isOutside ? 'delta/outside' : `delta/${_bucket(stat.deltas, _DELTAS)}`
        const load = `load/${_bucket(stat.patch + stat.dirty, _LOADS)}`
        return stat.base > limits.CHUNK ? [chunk, delta, load] : [chunk, delta]
}

// 本文と名前の種類の領域
export const kinds = (limits: Limits, texts: (string | null)[]) => {
        const found = _CLASSES.filter(([, test]) => texts.some((text) => test(text, limits.PAGE)))
        return found.map(([name]) => `text/${name}`)
}

export const crowd = (count: number) => `client/${_bucket(count, _CLIENTS)}`
