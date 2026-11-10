import type { Input } from '@db/client-share'

export const createWire = (send: Input['send']) => {
        let _queue: Promise<any> = Promise.resolve()
        return {
                send(op: object) {
                        const done = _queue.then(() => send(op))
                        _queue = done.catch(() => {})
                        return done
                },
        }
}
