import { applyOf, callOf, forkOf, listOf, takeOf, tallyOf } from '@db/test-executer-store-object'
import type { Device } from '@db/test-executer-share'
import type { Call, Entry, Trap } from '@db/test-executer-store-object'

interface Parked {
        id: string
        node: string
        apply: () => any
        resolve: (value: any) => void
        reject: (error: Error) => void
}

export const createStore = () => {
        const _stores = new Map<string, Map<number, Entry>>()
        const _log: Call[] = []
        const _spans = new Map<string, number>()
        const _dead = new Set<string>()
        const _faults: Trap[] = []
        const _holds: Trap[] = []

        let _parked: Parked | null = null
        let _wake = () => {}
        let _serial = 0

        const _of = (store: string) => _stores.get(store) ?? _stores.set(store, new Map()).get(store)!
        const codes: Device = {
                fork: (from, to, seqs) => void _stores.set(to, forkOf(_of(from), _of(to), seqs)),
                fail: (store, kind, nth, seq) => void _faults.push({ store, kind, nth, seq }),
                hold: (store, kind, seq) => void _holds.push({ store, kind, nth: 0, seq }),
                span: (store, node) => void _spans.set(`${store}/${node}`, _log.length),
                tally: (store, node) => tallyOf(_log.slice(_spans.get(`${store}/${node}`) ?? 0).filter((call) => call.store === store && call.node === node)),
                list: (store) => listOf(_of(store)),
        }
        return {
                codes,
                serve([kind, store, id, ...args]: any[]): Promise<any> {
                        if (_dead.has(id)) return new Promise(() => {})
                        const call = callOf(kind, store, id, args)
                        const apply = () => applyOf(_of(store), call, args, () => `t${++_serial}`)
                        _log.push(call)
                        call.fault = takeOf(_faults, call)
                        if (call.fault === kind) return Promise.reject(new Error(`injected ${kind}`))
                        if (!call.fault && takeOf(_holds, call)) return new Promise((resolve, reject) => ((_parked = { id, node: call.node, apply, resolve, reject }), _wake()))
                        const out = apply()
                        if (call.fault) return Promise.reject(new Error(`injected ${kind} after write`))
                        return Promise.resolve(out)
                },
                cut(id: string) {
                        _dead.add(id)
                },
                parked() {
                        return new Promise<void>((resolve) => (_parked ? resolve() : (_wake = resolve)))
                },
                held() {
                        return _parked?.node ?? null
                },
                isArmed() {
                        return _holds.length > 0
                },
                free(mode: string) {
                        const found = _parked
                        _parked = null
                        _holds.length = 0
                        if (!found) return null
                        const isAlive = !_dead.has(found.id)
                        const out = mode === 'arrive' ? found.apply() : null
                        if (isAlive && mode === 'arrive') found.resolve(out)
                        if (isAlive && mode !== 'arrive') found.reject(new Error('lost put'))
                        return { node: found.node, isAlive, isApplied: mode === 'arrive' && out !== null }
                },
                totals(store: string) {
                        return tallyOf(_log.filter((call) => call.store === store))
                },
        }
}
