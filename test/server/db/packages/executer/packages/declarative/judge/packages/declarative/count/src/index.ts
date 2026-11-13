import { calls, isHit, isStale, quota, shape } from '@test/server-executer-share'
import type { Event } from '@test/server-executer-share'
import type { Env } from '@test/server-executer-judge-share'

export const count = (env: Env) => ({
        // 回数: save 1 回の put は 1 回以下。変化が無い save は put しない。
        // open と save の get と put は、cost.md 9 節の式の回数を超えない
        calls(on: string, isSave: number) {
                const replica = env.fleet.of(on)
                const { log } = env.depot
                const seen = calls(log, replica)
                const tally = (op: string) => seen.filter((call) => call.op === op).length
                const used = { gets: tally('get'), puts: tally('put') }
                const spent = { stat: replica.before, calls: seen.map(shape) }
                const isOdd = replica.isSoiled || replica.isDoubt || isHit(log, replica) || isStale(log, replica)
                const isChanged = !used.puts || replica.writes > 0
                if (isSave) env.book.check('回数', 'put', used.puts <= 1, 1, used.puts)
                const known = replica.isRolled ? 'rolled' : ''
                if (isSave) env.book.check('回数', 'clean', isChanged, 'no put without a change', spent, known)
                if (!replica.out.ok || !replica.slots.event) return
                if (isOdd) return env.book.skip('回数: 障害か他の書き手の後の回数')
                const want = quota(env.limits, replica.slots.event as Event)
                const isWithin = used.gets <= want.gets && used.puts <= want.puts
                env.book.check('回数', isSave ? 'save' : 'open', isWithin, want, used)
        },
})
