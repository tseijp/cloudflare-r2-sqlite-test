import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { reduce } from '@test/client-executer-reduce'

import type { Code, Failure, Input, Run } from '@test/client-share'

type Table = Record<string, (...args: never[]) => unknown>

const _isStep = ([code]: Code) => code === 'step'

// 「code → 装置の操作」の表と、命令を上から順に実行する loop。装置は file と、scenario を走らせる道 (send)
export const createExecuter = (input: Input) => {
        const _runs: Run[] = []
        const _files = new Map<string, Code[]>()
        let _path = ''
        let _lines: Code[] = []
        const _write = (path: string, lines: Code[]) => {
                mkdirSync(dirname(path), { recursive: true })
                writeFileSync(path, `${lines.map(([, text]) => text).join('\n')}\n`)
        }
        const _line = (code: string) => (text: string) => _lines.push([code, text])
        // 同じ軸と名前の未知の崩れが、その列で残るか。試行の file に書いて走らせる
        const _retry = async (trial: string, lines: Code[], target: Failure) => {
                _write(trial, lines)
                const failures = (await input.send(trial)).tally?.failures ?? []
                const isSame = ({ axis, label }: Failure) => axis === target.axis && label === target.label
                return failures.some((failure) => !failure.known && isSame(failure))
        }
        const _table: Table = {
                open(path: string) {
                        _path = path
                        _lines = []
                },
                // line は固定の行、step は 1 手 (縮めるときに外せる単位)
                line: _line('line'),
                step: _line('step'),
                close() {
                        _write(_path, _lines)
                        _files.set(_path, _lines)
                },
                // scenario を走らせ、結果を覚える
                async send(path: string, seed: number) {
                        _runs.push({ ...(await input.send(path)), seed, fail: '' })
                },
                // 未知の崩れがあれば、同じ崩れが残る最短の列まで縮め、手で書いた形式の file に書き出す
                async shrink(path: string, fail: string, trial: string, budget: number) {
                        const run = _runs.findLast((item) => item.file === path)
                        const target = run?.tally?.failures.find((failure) => !failure.known)
                        const lines = _files.get(path) ?? []
                        const pick = (kept: Code[]) => lines.filter((line) => !_isStep(line) || kept.includes(line))
                        let count = 0
                        if (!run || !target) return
                        const test = (steps: Code[]) => _retry(`${trial}${++count}.ts`, pick(steps), target)
                        const kept = await reduce(lines.filter(_isStep), test, budget)
                        const note = `// ${target.axis}/${target.label} の崩れが残るように ${count} 回の試行で縮めた列`
                        _write(fail, [['line', note], ...pick(kept)])
                        run.fail = fail
                },
        }
        return {
                async run(codes: Code[]) {
                        for (const [code, ...args] of codes) await _table[code](...(args as never[]))
                        return _runs[_runs.length - 1]
                },
                stat() {
                        return { runs: _runs }
                },
        }
}
