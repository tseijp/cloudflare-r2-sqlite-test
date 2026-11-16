import { compile, explore, print } from '@db/test-compiler'
import { createExecuter } from '@db/test-executer'
import { SHAPES, twinOf } from '@db/test-share'
import type { Report, Send, Step } from '@db/test-share'

export interface Options {
        send: Send
        title?: string
}

export const createTest = ({ send, title = '' }: Options) => {
        const _executer = createExecuter(send)
        const _steps: Step[] = []

        let _tail: Promise<any> = Promise.resolve()

        const _run = async (step: Step): Promise<any> => {
                const { ret, then } = await _executer.execute(compile(step, await _executer.facts()), _steps.length)
                let out = ret
                for (const next of then) out = (await _run(next)) ?? out
                return out
        }
        const step = (next: Step): Promise<any> => {
                const out = _tail.then(() => (_steps.push(next), _run(next)))
                _tail = out.then(
                        () => null,
                        () => null,
                )
                return out
        }
        const _handle = (on: string, head: any[]): Record<string, (...args: any[]) => Promise<any>> => {
                const kinds = Object.entries(SHAPES).filter(([, [where]]) => where === on)
                return Object.fromEntries(kinds.map(([kind, [, method]]) => [method, (...args: any[]) => step([kind, ...head, ...args])]))
        }
        const done = (): Promise<Report> => _tail.then(() => _run(['done'])).then((report) => ({ title, steps: _steps.length, ...report }))
        return {
                ..._handle('t', []),
                step,
                done,
                serve: _executer.serve,
                explain: async (next: Step) => compile(next, await _executer.facts()),
                store: { ..._handle('store', []), expect: (want: object) => step(['see', -1, want]) },
                node(name: string) {
                        return { name, ..._handle('node', [name]), shadow: { name: twinOf(name), ..._handle('node', [twinOf(name)]) } }
                },
                client(id: string, node: { run: (op: object) => Promise<any> }) {
                        return {
                                id,
                                run: (op: object) => node.run({ ...op, id }),
                                window: (page: string, top = 0, size = 30) => node.run({ type: 'window', id, page, top, size }),
                                cell: (page: string, row: number, col: string, text: string | null, marks: any[] = []) => node.run({ type: 'cell', id, page, row, col, text, marks }),
                                style: (page: string, row: number, col: string, name: string, value: string | null) => node.run({ type: 'style', id, page, row, col, name, value }),
                                undo: () => node.run({ type: 'undo', id }),
                                redo: () => node.run({ type: 'redo', id }),
                                leave: () => node.run({ type: 'leave', id }),
                        }
                },
                replica(seq: number) {
                        return { fail: (kind: string, nth = 0) => step(['fail', kind, nth, seq]), hold: () => step(['hold', 'put', seq]), expect: (want: object) => step(['see', seq, want]) }
                },
                async play(steps: Step[]) {
                        for (const next of steps) await step(next)
                        return done()
                },
                script() {
                        return print(_steps, title)
                },
        }
}

export { explore, print }

export type { Report, Send, Step } from '@db/test-share'
