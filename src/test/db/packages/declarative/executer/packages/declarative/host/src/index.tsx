import { settle } from '@db/test-executer-share'
import { digestOf, relayOf, repeatOf, rowsOf } from '@db/test-executer-host-flow'
import type { Send } from '@db/test-share'
import type { Device, Outcome } from '@db/test-executer-share'

export const createHost = (send: Send) => {
        const _ids = new Map<string, string>()
        const _casts = new Map<string, Promise<void>>()

        let _epoch = 0

        const ask = (via: string, node: string, ...args: any[]): Promise<Outcome> => {
                const id = _ids.get(node)
                if (!id) return Promise.resolve({ error: 'no instance' })
                return settle(() => send([via, id, ...args]))
        }
        const codes: Device = {
                boot: (node, store) => send(['boot', _ids.set(node, `${node}#${++_epoch}`).get(node), store]).then(() => undefined),
                call: (node, via, payload) => ask(via, node, JSON.parse(payload)),
                stat: (node) => ask('stat', node).then((got) => got.ok ?? null),
                tree: (node) => ask('view', node).then((got) => got.ok ?? null),
                digest: (node, list, rows, batch) => digestOf(ask, node, list, rows, batch),
                feed: (node, template, slot, width, count, bytes, seed, batch) => repeatOf(ask, node, count, batch, (from, size) => ({ ...JSON.parse(template), [slot]: rowsOf(from, size, width, bytes, seed) })),
                csv: async (node, file, bytes) => relayOf(ask, node, await settle(() => send(['csv', file, bytes]))),
        }
        return {
                codes,
                ask,
                alive() {
                        return [..._ids.keys()]
                },
                cast(node: string, via: string, payload: any, done: (out: Outcome) => void) {
                        _casts.set(node, ask(via, node, payload).then(done))
                },
                settled(node: string) {
                        return _casts.get(node) ?? Promise.resolve()
                },
                async kill(node: string) {
                        const id = _ids.get(node) ?? ''
                        _ids.delete(node)
                        if (id) await send(['kill', id])
                        return id
                },
        }
}
