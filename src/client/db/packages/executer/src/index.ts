import { createState } from '@db/client-executer-state'
import { createWire } from '@db/client-executer-wire'
import type { Code, Event, Input, State } from '@db/client-share'

export { View } from '@db/client-executer-dom'

export const createExecuter = ({ doc, id, send }: Input) => {
        const _state = createState(doc, id)
        const _wire = createWire(send)
        const _CODES: Record<string, (...args: any[]) => void> = {
                state: (patch: Partial<State>) => _state.patch(patch),
                send: (op: Event, key?: string) => {
                        const done = (value: any) => _state.patch(key ? { [key]: value } : {})
                        const fail = (error: any) => _state.patch({ note: String(error?.message ?? error) })
                        void _wire.send(op).then(done, fail)
                },
        }
        return {
                run: (codes: Code[]) => codes.forEach(([code, ...args]) => _CODES[code](...args)),
                snap: _state.snap,
                subscribe: _state.subscribe,
        }
}
