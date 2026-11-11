import type { Limits } from './types.ts'

// SQL の識別子として囲む
export const quote = (name: string) => `"${name.replaceAll('"', '""')}"`

// delta を 1 つ足してよい範囲 (score.md 3 節、cost.md 9 節)。load は patch + dirty
export const canPush = (limits: Limits, base: number, deltas: number, load: number) =>
        base > limits.CHUNK && deltas < limits.SLOTS && load < limits.CHUNK
