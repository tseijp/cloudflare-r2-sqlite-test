import { ratio, RATIOS } from '@test/server-executer-book-ratio'
import { AXES } from '@test/server-share'
import { bill, brief, OPS } from '@test/server-executer-share'
import type { Failure, Limits, Tally } from '@test/server-share'
import type { Call, Event } from '@test/server-executer-share'

type Bag = Record<string, number>

const _add = (bag: Bag, key: string, count = 1) => (bag[key] = (bag[key] ?? 0) + count)

const _zero = (keys: string[]): Bag => Object.fromEntries(keys.map((key) => [key, 0]))

// 判定の記録。手の番号、崩れ、判定した軸、到達した領域、費用の出来事を持ち、1 手ごとに 1 行を出す。
// known は「崩れの原因 → 既知の issue の番号」で、scenario の側が渡す
export const createBook = (limits: Limits, known: Record<string, string>) => {
        const _failures: Failure[] = []
        const _judged = _zero(AXES)
        const _regions = _zero(RATIOS)
        const _unmeasured: Bag = {}
        let _events: Event[] = []
        let _step = 0
        // @ts-ignore
        const line = (text: string) => process.stdout.write(`${_step} ${text}\n`)
        return {
                line,
                next() {
                        _step++
                },
                // 軸を 1 回判定したと数え、成り立たなければ崩れとして残す。cause は原因の名前か、issue の番号
                check(axis: string, label: string, isHeld: boolean, expected: unknown, observed: unknown, cause = '') {
                        const issue = known[cause] ?? cause
                        _add(_judged, axis)
                        if (isHeld) return
                        _failures.push({ step: _step, axis, label, known: issue, expected, observed })
                        line(`崩れ ${axis}/${label}${issue && ` (既知 ${issue})`} 期待 ${brief(expected)}`)
                        line(`崩れ ${axis}/${label} 観測 ${brief(observed)}`)
                },
                // 到達を数える領域を、0 回として並べておく。到達が 0 回のまま終われば未計測である
                zero(keys: string[]) {
                        for (const key of keys) _add(_regions, key, 0)
                },
                reach(key: string) {
                        _add(_regions, key)
                },
                skip(reason: string) {
                        _add(_unmeasured, reason)
                },
                spend(event: Event) {
                        _events.push(event)
                },
                // 費用の計測をここから始める
                measure() {
                        _events = []
                },
                // scenario の記録。store の回数と byte は全ての手、費用は measure の後の手から数える
                done(log: Call[]): Tally {
                        const store: Bag = {}
                        const cost = bill(limits, _events)
                        for (const call of log.filter((item) => OPS.includes(item.op))) {
                                _add(store, call.op)
                                if (call.op !== 'delete') _add(store, `${call.op}Bytes`, call.bytes)
                        }
                        _add(_regions, ratio(_events))
                        _add(_judged, '式', cost.observed > 0 ? 1 : 0)
                        const counts = { judged: _judged, regions: _regions, unmeasured: _unmeasured }
                        return { steps: _step, failures: _failures, cost, store, ...counts }
                },
        }
}
