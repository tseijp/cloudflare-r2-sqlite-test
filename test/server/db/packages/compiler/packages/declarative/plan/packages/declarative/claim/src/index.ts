import { note } from '@test/server-compiler-plan-share'
import type { Plan } from '@test/server-compiler-plan-share'

interface Want {
        axis: string
        known?: string
}

// 手で書いた期待値と比べる手。期待値は scenario が持ち、plan は運ぶだけである
export const claim: Record<string, Plan> = {
        expect: ({ on, want }) => {
                const { axis, known = '', ...rest } = want as Want
                const text = `${on} expect ${JSON.stringify(rest).slice(0, 120)}`
                return note(on, text, [['judge', 'expect', on, axis, known, rest]])
        },
}
