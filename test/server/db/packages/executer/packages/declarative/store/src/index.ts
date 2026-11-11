import type { Part, Store } from '@test/server-share'
import type { Call } from '@test/server-executer-share'

interface Held {
        who: string
        seq: number
        bytes: Uint8Array
        tag: string
        call: Call
        resolve(tag: string | null): void
        reject(error: Error): void
}

const _BLANK = { seq: -1, seqs: [], offset: 0, length: -1, bytes: 0, tag: '', hit: '', done: '', hold: false }

// 模擬 store。object、tag、呼び出しの記録、予約された障害、保留した put、書き込みごとの写しを持つ
export const createStore = () => {
        const _parts = new Map<number, Part>()
        const _faults: { who: string; kind: string; skip: number }[] = []
        const _held: Held[] = []
        const _parked = new Map<string, () => void>()
        const log: Call[] = []
        const shots: Map<number, Part>[] = []
        let _serial = 0
        const _note = (who: string, op: string, fields: Partial<Call>) => {
                const call = { ..._BLANK, who, op, ...fields }
                log.push(call)
                return call
        }
        // その method への次の呼び出しに予約された障害を 1 つ取り出す
        const _take = (who: string, op: string) => {
                const index = _faults.findIndex((fault) => fault.who === who && fault.kind.split('.')[0] === op)
                if (index < 0 || _faults[index].skip-- > 0) return ''
                return _faults.splice(index, 1)[0].kind
        }
        const _swap = (seq: number, bytes: Uint8Array, tag: string, call: Call) => {
                if ((_parts.get(seq)?.tag ?? '') !== tag) return null
                call.done = `t${++_serial}`
                _parts.set(seq, { bytes, tag: call.done })
                shots.push(new Map(_parts))
                return call.done
        }
        const handle = (who: string): Store => ({
                async get(seq, offset = 0, length = -1) {
                        const call = _note(who, 'get', { seq, offset, length })
                        const part = _parts.get(seq)
                        call.hit = _take(who, 'get')
                        if (call.hit) throw new Error('injected get')
                        if (!part) return null
                        if (offset > part.bytes.length) throw new Error('range not satisfiable')
                        const bytes = part.bytes.slice(offset, length < 0 ? undefined : offset + length)
                        call.bytes = bytes.length
                        call.done = part.tag
                        return { bytes, tag: part.tag }
                },
                async put(seq, bytes, tag) {
                        const call = _note(who, 'put', { seq, tag, bytes: bytes.length })
                        const copy = bytes.slice()
                        call.hit = _take(who, 'put')
                        if (call.hit === 'put') throw new Error('injected put')
                        if (call.hit === 'put.null') return null
                        if (call.hit === 'put.hold') {
                                call.hold = true
                                return new Promise<string | null>((resolve, reject) => {
                                        _held.push({ who, seq, bytes: copy, tag, call, resolve, reject })
                                        _parked.get(who)?.()
                                })
                        }
                        const next = _swap(seq, copy, tag, call)
                        if (call.hit === 'put.after') throw new Error('injected put after write')
                        return next
                },
                async delete(seqs) {
                        const call = _note(who, 'delete', { seqs })
                        call.hit = _take(who, 'delete')
                        if (call.hit) throw new Error('injected delete')
                        if (!seqs.filter((seq) => _parts.delete(seq)).length) return
                        call.done = 'deleted'
                        shots.push(new Map(_parts))
                },
        })
        return {
                handle,
                log,
                shots,
                fault(who: string, kind: string, skip: number) {
                        _faults.push({ who, kind, skip })
                },
                // who の put が保留されたら解決する Promise
                parked(who: string) {
                        return new Promise<void>((resolve) => _parked.set(who, resolve))
                },
                // 予約したまま使われなかった保留を取り消す
                calm(who: string) {
                        const index = _faults.findIndex((fault) => fault.who === who && fault.kind === 'put.hold')
                        if (index >= 0) _faults.splice(index, 1)
                },
                isHolding(who: string) {
                        return _held.some((held) => held.who === who)
                },
                // 保留した put を store に届けるか、失う
                release(who: string, fate: string) {
                        const index = _held.findIndex((item) => item.who === who)
                        if (index < 0) throw new Error(`${who} に保留した put がありません`)
                        const held = _held.splice(index, 1)[0]
                        const note = _note(who, fate, { seq: held.seq, tag: held.tag, bytes: held.bytes.length })
                        if (fate === 'lose') return held.reject(new Error('lost put'))
                        held.resolve(_swap(held.seq, held.bytes, held.tag, note))
                },
                copy() {
                        return new Map(_parts)
                },
                // 写しを戻す。seqs があれば、その番号の object だけを今の store に置く
                paste(parts: Map<number, Part>, seqs?: number[]) {
                        if (!seqs) _parts.clear()
                        for (const [seq, part] of parts) if (!seqs || seqs.includes(seq)) _parts.set(seq, part)
                        _note('*', 'paste', { seqs: seqs ?? [...parts.keys()], done: 'pasted' })
                        shots.push(new Map(_parts))
                },
                list() {
                        const parts = [..._parts].sort(([left], [right]) => left - right)
                        return parts.map(([seq, part]) => [seq, part.tag, part.bytes.length])
                },
        }
}
