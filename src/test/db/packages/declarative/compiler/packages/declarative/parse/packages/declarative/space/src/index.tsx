import { intOf, pickOf, roll } from '@db/test-compiler-parse-share'
import type { Fixture, Region, Spec, Table } from '@db/test-compiler-share'

const _MIB = 1048576

const _USES = ['life', 'crowd', 'churn', 'ingest', 'scan']

const _EVENTS = ['calm', 'crash', 'fault', 'rival', 'chain']

const _TEXTS = ['ascii', '日本語', '記号', '長文']

const _SIZES = [
        [4096, 1.2 * _MIB],
        [2.5 * _MIB, 6 * _MIB],
        [9 * _MIB, 24 * _MIB],
]

const _DEPTHS = [
        [0, 0],
        [1, 2],
        [3, 4],
        [5, 8],
]

const _tableOf = (fixture: Fixture, bytes: number): Table => {
        const used = Math.max(4096, Math.min(fixture.size, Math.round(bytes)))
        return { file: fixture.file, bytes: used, page: fixture.page, col: fixture.names[0], names: fixture.names, rows: Math.max(1, Math.floor((used / fixture.line) * 0.8)) }
}

export const space = ({ seed, steps = 60, fixtures, K }: Spec): Region => {
        const size = Math.floor(seed / 25) % _SIZES.length
        const depth = size === 0 ? 0 : Math.floor(seed / 75) % _DEPTHS.length
        const count = intOf(roll(seed, 'tables'), 1, Math.min(3, fixtures.length))
        const total = _SIZES[size][0] + roll(seed, 'bytes') * (_SIZES[size][1] - _SIZES[size][0])
        const shares = Array.from({ length: count }, (_, at) => (count === 1 ? 1 : at === 0 ? 0.6 : 0.4 / (count - 1)))
        const shuffled = [...fixtures].sort((a, b) => roll(seed, 'file', a.file) - roll(seed, 'file', b.file))
        const first = shuffled.find((fixture) => fixture.size >= total * shares[0]) ?? [...fixtures].sort((a, b) => b.size - a.size)[0]
        const files = [first, ...shuffled.filter((fixture) => fixture !== first)].slice(0, count)
        const deltas = depth === 0 ? 0 : intOf(roll(seed, 'deltas'), _DEPTHS[depth][0], Math.min(_DEPTHS[depth][1], K.SLOTS))
        const per = deltas === 0 ? 0 : intOf(roll(seed, 'patch'), 1, Math.floor((K.CHUNK - 16) / deltas))
        const clients = intOf(roll(seed, 'clients'), seed % _USES.length === 1 ? 2 : 1, seed % _USES.length === 1 ? 10 : 3)
        return {
                seed,
                steps,
                use: _USES[seed % _USES.length],
                event: _EVENTS[Math.floor(seed / 5) % _EVENTS.length],
                size,
                tables: files.map((fixture, at) => _tableOf(fixture, total * shares[at])),
                deltas,
                patch: per * deltas,
                residue: deltas > 0 && roll(seed, 'residue') < 0.25,
                clients: Array.from({ length: clients }, (_, at) => `u${at + 1}`),
                text: pickOf(roll(seed, 'text'), _TEXTS),
        }
}
