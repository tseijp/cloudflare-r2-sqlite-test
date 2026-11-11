import { createBook } from '@test/server-executer-book'
import { createFleet } from '@test/server-executer-fleet'
import { createJudge } from '@test/server-executer-judge'
import { createMemory } from '@test/server-executer-memory'
import { createPilot } from '@test/server-executer-pilot'
import { createReport } from '@test/server-executer-report'
import { createStore } from '@test/server-executer-store'
import { ZERO } from '@test/server-executer-share'
import type { Code, Input, Part, Summary } from '@test/server-share'

type Table = Record<string, (...args: never[]) => unknown>

interface Copy {
        parts: Map<number, Part>
        good: unknown
}

// 「code → 装置の操作」の表と、命令を上から順に実行する loop。装置を作って持つのはここだけである
export const createExecuter = (input: Input) => {
        const { make: _make, limit: _limit, known: _known, ..._limits } = input
        const _world = { clock: 0, most: 0, ids: new Set<string>() }
        const _memo = { shot: 0, good: undefined as unknown, isCrossed: false }
        const _copies = new Map<string, Copy>()
        const _depot = createStore()
        const _fleet = createFleet(input, _depot, createStore)
        const _book = createBook(_limits, _known)
        const _judge = createJudge({ limits: _limits, fleet: _fleet, depot: _depot, book: _book, memo: _memo }) as Table
        const _pilot = createPilot(_fleet, _depot, _world, _book.reach)
        const _report = createReport(_limits, _fleet.of, _depot, _book, _world)
        const _table: Table = {
                ..._pilot,
                ...createMemory(_fleet.of, _world),
                ..._report,
                // 手の始まり。この手の間の store の写しを数え始める
                begin: (on: string) => {
                        _memo.shot = _depot.shots.length
                        _report.begin(on)
                },
                judge: (rule: string, ...args: never[]) => _judge[rule](...args),
                note: (text: string) => _book.line(text),
                mark: (key: string) => _book.reach(key),
                measure: () => _book.measure(),
                limit: (seconds: number) => _limit(seconds),
                tick: (seconds: number) => (_world.clock += seconds),
                every: (on: string, seconds: number) => (_fleet.of(on).every = seconds),
                fault: (on: string, kind: string, skip: number) => _depot.fault(on, kind, skip),
                calm: (on: string) => _depot.calm(on),
                // 保留した put を届けるか失い、待っていた命令の結果を受け取る
                release: (on: string, fate: string) => {
                        _depot.release(on, fate)
                        return _pilot.resume(on)
                },
                copy: (label: string) => _copies.set(label, { parts: _depot.copy(), good: _memo.good }),
                // 写しを戻す。全体を戻したときは、確かめた内容も写しの時点に戻す
                paste: (label: string, seqs: number[] | null) => {
                        const copy = _copies.get(label)
                        if (!copy) throw new Error(`写し ${label} がありません`)
                        _depot.paste(copy.parts, seqs ?? undefined)
                        _memo.good = seqs ? _memo.good : copy.good
                },
        }
        const _seat = (name: string) => {
                const { db, every, edited, unsaved } = _fleet.of(name)
                const isHeld = _depot.isHolding(name)
                return { isLive: !!db, isHeld, every, edited, unsaved, stat: db?.stat() ?? ZERO }
        }
        return {
                async run(codes: Code[]) {
                        let result: unknown
                        for (const [code, ...args] of codes) result = await _table[code](...(args as never[]))
                        return result
                },
                // 状態の要約。compiler が分岐に使ってよい状態はこれだけ
                stat(): Summary {
                        const seats = Object.fromEntries(_fleet.names().map((name) => [name, _seat(name)]))
                        return { ..._limits, clock: _world.clock, seats }
                },
        }
}
