import { costOf } from '@db/test-executer-judge-cost'
import type { Consts, Count, Fail } from '@db/test-share'
import type { Device } from '@db/test-executer-share'
import type { Bill } from '@db/test-executer-judge-cost'

export const createJudge = () => {
        const _axes: Record<string, Count> = {}
        const _fails: Fail[] = []
        const _bills: Bill[] = []
        const _notes: string[] = []

        let _at = 0

        const codes: Device = {
                check: (axis, pass, note, known) => {
                        const count = (_axes[axis] ??= { pass: 0, fail: 0, known: 0 })
                        if (pass) return void count.pass++
                        count[known ? 'known' : 'fail']++
                        _fails.push({ axis, note, known, at: _at })
                },
                bill: (kind, entry) => void _bills.push({ kind, ...JSON.parse(entry) }),
                say: (text) => void _notes.push(`${_at} ${text}`),
        }
        return {
                codes,
                step(at: number) {
                        _at = at
                },
                close(K: Consts) {
                        return { axes: _axes, fails: _fails, notes: _notes, cost: costOf(_bills, K) }
                },
        }
}
