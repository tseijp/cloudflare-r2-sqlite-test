import { isCount, isList, isNumber, isPlain, isRate, isText } from '@test/client-compiler-parse-check'
import { DEFAULTS } from '@test/client-share'
import type { Spec } from '@test/client-share'

type Check = (value: unknown) => boolean

// 指定の種類 → { field 名 → 検査関数 }
const _TABLE: Record<string, Record<string, Check>> = {
        explore: {
                seed: isCount,
                steps: isCount,
                faults: isRate,
                rivals: isRate,
                crashes: isRate,
                shrink: isCount,
                head: isText,
                file: isText,
                fail: isText,
                trial: isText,
        },
        ledger: {
                file: isText,
                at: isText,
                seeds: isText,
                seconds: isNumber,
                limits: isPlain,
                settings: isPlain,
                runs: isList,
        },
}

// 指定を検査し、既定値を埋めた正規形にする。表に無い field は捨てる
export const parse = (spec: Record<string, unknown>): Spec => {
        const fields = _TABLE[spec.type as string]
        if (!fields) throw new Error(`unknown spec: ${spec.type}`)
        const result: Spec = { type: spec.type as string }
        for (const [name, check] of Object.entries(fields)) {
                result[name] = spec[name] ?? (DEFAULTS as Record<string, unknown>)[name]
                if (!check(result[name])) throw new Error(`invalid ${spec.type}.${name}`)
        }
        return result
}
