import type { Stat } from '@test/server-share'
import type { Outcome } from './types.ts'


export const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

export const range = (from: number, to: number) =>
        Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index)

export const ZERO: Stat = { pages: 0, base: 0, dirty: 0, deltas: 0, patch: 0 }

export const NONE: Outcome = { ok: false, held: false, value: undefined, error: '' }

// Promise を、解決か reject かの値にする
export const settle = (promise: Promise<unknown>): Promise<Outcome> =>
        promise.then(
                (value) => ({ ...NONE, ok: true, value }),
                (error) => ({ ...NONE, error: String(error?.message ?? error) }),
        )

export const brief = (value: unknown, width = 160) => {
        const text = JSON.stringify(value) ?? 'undefined'
        return text.length > width ? `${text.slice(0, width)}…` : text
}
