import { createStore } from '@db/test-executer-store'
import { createHost } from '@db/test-executer-host'
import { createJudge } from '@db/test-executer-judge'
import { MAIN } from '@db/test-share'
import type { Code, Consts, Facts, Send, Step } from '@db/test-share'
import type { Device } from '@db/test-executer-share'

export const createExecuter = (send: Send) => {
        const _reg: Record<string, any> = { now: 0, policy: null, saved: null, maybe: [], writes: 0, stamp: 0, writer: null, regions: {}, marks: {} }
        const _store = createStore()
        const _host = createHost(send)
        const _judge = createJudge()

        let _K: Consts | null = null

        const _DEVICE: Device = {
                ..._store.codes,
                ..._host.codes,
                ..._judge.codes,
                cast: (node, via, payload, out) => _host.cast(node, via, JSON.parse(payload), (got) => void (_reg[out] = got)),
                park: (node) => Promise.race([_store.parked(), _host.settled(node)]).then(() => _store.held()),
                free: async (mode) => {
                        const freed = _store.free(mode)
                        if (freed?.isAlive) await _host.settled(freed.node)
                        return freed
                },
                kill: async (node) => _store.cut(await _host.kill(node)),
                set: (name, json) => void (_reg[name] = JSON.parse(json)),
                then: (json) => void _reg.$then.push(JSON.parse(json)),
                ret: (json) => JSON.parse(json),
                close: (json) => ({ ...JSON.parse(json), ..._judge.close(_K!), store: _store.totals(MAIN) }),
        }
        return {
                serve: _store.serve,
                async execute(codes: Code[], at: number) {
                        Object.assign(_reg, { $ret: null, $then: [] })
                        _judge.step(at)
                        for (const [code, ...operand] of codes) {
                                const got = await _DEVICE[code](...operand)
                                if (got !== undefined) _reg[operand[operand.length - 1] as string] = got
                        }
                        return { ret: _reg.$ret, then: _reg.$then as Step[] }
                },
                async facts(): Promise<Facts> {
                        _K ??= await send(['const'])
                        const alive = _host.alive()
                        const nodes: Facts['nodes'] = {}
                        for (const node of alive.filter((name) => _reg[`${name}.open`])) nodes[node] = { stat: (await _host.ask('stat', node)).ok, save: (await _host.ask('compile', node, { type: 'save' })).ok?.[0]?.[0] ?? 'none' }
                        return { K: _K!, reg: { ..._reg }, nodes, alive, isArmed: _store.isArmed(), held: _store.held() }
                },
        }
}
