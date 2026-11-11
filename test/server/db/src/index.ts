import { compile, fields } from '@test/server-compiler'
import { createExecuter } from '@test/server-executer'
import type { Code, Input, Tally } from '@test/server-share'

type Move = Record<string, unknown>

type Step = (...args: unknown[]) => Promise<unknown>

// 手の種類のうち、instance 宛て (on を持つ) か、simulation 全体宛てかで選ぶ
const _kinds = (isOn: boolean) => Object.keys(fields).filter((type) => fields[type].includes('on') === isOn)

// 引数の並びを、名前の付いた field にする
const _named = (type: string, args: unknown[]) => {
        const names = fields[type].filter((name) => name !== 'on')
        return Object.fromEntries(names.map((name, index) => [name, args[index]]))
}

// 検証の入口。scenario の 1 手を compile し、命令の列を 1 本の列に並べて実行する
export const createSim = (input: Input) => {
        const _executer = createExecuter(input)
        let _queue: Promise<unknown> = Promise.resolve()
        const execute = (codes: Code[]) => (_queue = _queue.then(() => _executer.run(codes)))
        const _step = (move: Move) => (_queue = _queue.then(() => _executer.run(compile(move, _executer.stat()))))
        // 手の種類ごとに、その手を列に並べる関数を作る
        const _steps = (on: string, isOn: boolean): Record<string, Step> => {
                const step = (type: string) => (...args: unknown[]) => _step({ type, on, ..._named(type, args) })
                return Object.fromEntries(_kinds(isOn).map((type) => [type, step(type)]))
        }
        return {
                ..._steps('', false),
                compile,
                execute,
                stat: _executer.stat,
                replica: (on: string) => _steps(on, true),
                done: () => _step({ type: 'done' }) as Promise<Tally>,
        }
}
