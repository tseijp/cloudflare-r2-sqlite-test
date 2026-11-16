import type { Tally } from '@db/test-executer-share'

export interface Entry {
        bytes: Uint8Array
        tag: string
}

export interface Call {
        store: string
        node: string
        kind: string
        seqs: number[]
        size: number
        fault: string
        isDone: boolean
}

export interface Trap {
        store: string
        kind: string
        nth: number
        seq: number
}

type Apply = (objects: Map<number, Entry>, call: Call, args: any[], tagOf: () => string) => any

const _APPLY: Record<string, Apply> = {
        get(objects, call, [seq, offset = 0, length]) {
                const found = objects.get(seq)
                if (!found) return null
                const bytes = found.bytes.slice(offset, length === undefined ? undefined : offset + length)
                call.size = bytes.length
                return { bytes, tag: found.tag }
        },
        put(objects, call, [seq, bytes, tag], tagOf) {
                if ((objects.get(seq)?.tag ?? '') !== tag) return null
                objects.set(seq, { bytes: bytes.slice(), tag: tagOf() })
                call.isDone = true
                return objects.get(seq)!.tag
        },
        delete(objects, call, [seqs]) {
                seqs.forEach((seq: number) => objects.delete(seq))
                call.isDone = true
                return null
        },
}

export const callOf = (kind: string, store: string, id: string, args: any[]): Call => {
        const seqs: number[] = kind === 'delete' ? args[0] : [args[0]]
        return { store, node: id.split('#')[0], kind, seqs, size: kind === 'put' ? args[1].length : 0, fault: '', isDone: false }
}

export const applyOf: Apply = (objects, call, args, tagOf) => _APPLY[call.kind](objects, call, args, tagOf)

export const takeOf = (traps: Trap[], call: Call) => {
        const found = traps.find((trap) => trap.store === call.store && trap.kind.split('.')[0] === call.kind && (trap.seq < 0 || call.seqs.includes(trap.seq)))
        if (!found || found.nth-- > 0) return ''
        traps.splice(traps.indexOf(found), 1)
        return found.kind
}

export const forkOf = (source: Map<number, Entry>, target: Map<number, Entry>, seqs: number[] | null) => {
        if (!seqs) return new Map(source)
        seqs.forEach((seq) => (source.has(seq) ? target.set(seq, source.get(seq)!) : target.delete(seq)))
        return target
}

export const listOf = (objects: Map<number, Entry>) => {
        const seqs = [...objects.keys()].sort((a, b) => a - b)
        return { seqs, image: objects.get(0)?.bytes.length ?? 0, bytes: seqs.reduce((total, seq) => total + objects.get(seq)!.bytes.length, 0) }
}

export const tallyOf = (calls: Call[]): Tally => {
        const count = (isHit: (call: Call) => boolean) => calls.filter(isHit).length
        return {
                get: count((call) => call.kind === 'get'),
                put: count((call) => call.kind === 'put'),
                delete: count((call) => call.kind === 'delete'),
                calls: calls.length,
                bytes: calls.reduce((total, call) => total + call.size, 0),
                image: count((call) => call.kind === 'put' && call.isDone && call.seqs[0] === 0),
                delta: count((call) => call.kind === 'put' && call.isDone && call.seqs[0] > 0),
                wrote: count((call) => call.kind === 'put' && call.isDone),
                fail: count((call) => call.fault !== ''),
                after: count((call) => call.fault === 'put.after'),
                faults: calls.filter((call) => call.fault !== '').map((call) => call.fault),
        }
}
