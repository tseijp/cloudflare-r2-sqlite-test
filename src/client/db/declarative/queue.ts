import type { Op, Req, Send } from '../procedural/share/types'

export const createQueue = (send: Send, view: string): Send => {
        let _tail: Promise<unknown> = Promise.resolve()
        const _queue = <T>(fn: () => Promise<T>) => {
                const out = _tail.then(fn)
                _tail = out.catch(() => null)
                return out
        }
        return {
                act(op: Op) {
                        return _queue(() => send.act(op))
                },
                move(req: Req) {
                        return _queue(() => send.move({ ...req, view }))
                },
                undo() {
                        return _queue(() => send.undo())
                },
                redo() {
                        return _queue(() => send.redo())
                },
                load(sheets) {
                        return _queue(() => send.load(sheets))
                },
        }
}
