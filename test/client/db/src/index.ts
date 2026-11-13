import { compile } from '@test/client-compiler'
import { createExecuter } from '@test/client-executer'
import type { Code, Input, Run } from '@test/client-share'

// 生成の入口。指定を compile し、命令の列を 1 本の列に並べて実行する
export const createGen = (input: Input) => {
        const _executer = createExecuter(input)
        let _queue: Promise<unknown> = Promise.resolve()
        const execute = (codes: Code[]) => (_queue = _queue.then(() => _executer.run(codes))) as Promise<Run>
        return {
                compile,
                execute,
                stat: _executer.stat,
                run: (spec: Record<string, unknown>) => execute(compile(spec)),
        }
}
