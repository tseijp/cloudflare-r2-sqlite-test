import { hash } from '@db/test-executer-share'
import type { Outcome } from '@db/test-executer-share'

type Ask = (via: string, node: string, ...args: any[]) => Promise<Outcome>

const _WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima']

const _mix = (value: number) => {
        const state = (value + 0x6d2b79f5) >>> 0
        const mixed = Math.imul(state ^ (state >>> 15), state | 1)
        return (mixed ^ (mixed >>> 14)) >>> 0
}

const _text = (key: number, length: number) => {
        let text = ''
        for (let i = 0; text.length < length; i++) text += `${_WORDS[_mix(key + i) % _WORDS.length]}${_mix(key * 7 + i) % 100000} `
        return text.slice(0, length)
}

export const rowsOf = (from: number, count: number, width: number, bytes: number, seed: number): string[][] => {
        const size = Math.max(1, Math.floor(bytes / width))
        return Array.from({ length: count }, (_, row) => Array.from({ length: width }, (_, col) => _text(seed * 1009 + (from + row) * 31 + col, size)))
}

export const digestOf = async (ask: Ask, node: string, list: string, rows: string, batch: number) => {
        const tables = await ask('execute', node, [['read', list, batch]])
        if (tables.error) return tables.error
        let sum = hash(JSON.stringify(tables.ok))
        for (const [name] of tables.ok.slice(1)) {
                const text = rows.replace('{table}', `"${String(name).replace(/"/g, '""')}"`)
                for (let offset = 0, size = batch; size === batch; offset += batch) {
                        const out = await ask('execute', node, [['read', text.replace('{offset}', String(offset)), batch]])
                        if (out.error) return out.error
                        size = out.ok.length - 1
                        sum = hash(JSON.stringify(out.ok.slice(1)), sum)
                }
        }
        return sum
}

export const repeatOf = async (ask: Ask, node: string, count: number, batch: number, opOf: (from: number, size: number) => object) => {
        let out: Outcome = { ok: null }
        for (let from = 0; from < count && !out.error; from += batch) out = await ask('run', node, opOf(from, Math.min(batch, count - from)))
        return out
}

export const relayOf = async (ask: Ask, node: string, ops: Outcome) => {
        let out: Outcome = ops.error ? ops : { ok: null }
        for (const op of ops.ok ?? []) if (!out.error) out = await ask('run', node, op)
        return out
}
