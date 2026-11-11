import { compile } from '@db/server-compiler'
import { createExecuter } from '@db/server-executer'
import type { Code, Input, Op } from '@db/server-share'

export const createDb = (input: Input) => {
        const _executer = createExecuter(input)
        let _queue: Promise<any> = Promise.resolve()
        const _line = (job: () => Promise<any>) => {
                const done = _queue.then(job)
                _queue = done.catch(() => {})
                return done
        }
        const _step = async (op: Op): Promise<any> => {
                const out = await _executer.run(compile(op, _executer.stat()))
                for (const echo of _executer.echo()) await _step(echo)
                return out
        }
        return {
                compile,
                stat: _executer.stat,
                execute: (codes: Code[]) => _line(() => _executer.run(codes)),
                run: (op: Op) => _line(() => _step(op)),
        }
}

export { CHUNK, LIMIT, PAGE, ROOM, ROWS, SLOTS, SWAP } from '@db/server-share'

export type { Code, Input, Op, Part, Stat, Store } from '@db/server-share'
