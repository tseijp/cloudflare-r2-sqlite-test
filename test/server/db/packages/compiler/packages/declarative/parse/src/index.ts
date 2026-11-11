import { isCodes, isCount, isFate, isFault, isName } from '@test/server-compiler-parse-check'
import { isOp, isSeqs, isText, isTexts, isWant } from '@test/server-compiler-parse-check'
import type { Move } from '@test/server-share'

type Check = (value: unknown) => boolean

// 手の種類 → { field 名 → 検査関数 }
const _TABLE: Record<string, Record<string, Check>> = {
        open: { on: isName },
        stop: { on: isName },
        run: { on: isName, op: isOp },
        reject: { on: isName, op: isOp },
        invalid: { on: isName, op: isOp },
        save: { on: isName },
        exec: { on: isName, codes: isCodes },
        fill: { on: isName, page: isText, col: isText, rows: isCount, size: isCount },
        load: { on: isName, page: isText, names: isTexts, rows: isCount, size: isCount, salt: isCount, over: isCount },
        push: { on: isName },
        merge: { on: isName },
        fault: { on: isName, kind: isFault, skip: isCount },
        hold: { on: isName },
        release: { on: isName, fate: isFate },
        every: { on: isName, seconds: isCount },
        expect: { on: isName, want: isWant },
        tick: { seconds: isCount },
        copy: { label: isText },
        paste: { label: isText, seqs: isSeqs },
        measure: {},
        limit: { seconds: isCount },
        mark: { key: isText },
        done: {},
}

// 省いてよい field の既定値
const _DEFAULTS: Record<string, unknown> = { on: '', skip: 0, salt: 0, over: 0, seqs: null }

// 手を受け付けるかを決め、表の field だけを持つ正規形にする
export const parse = (move: Record<string, unknown>): Move => {
        const fields = _TABLE[move.type as string]
        if (!fields) throw new Error(`unknown move: ${move.type}`)
        const result: Move = { type: move.type as string, on: '' }
        for (const [name, check] of Object.entries(fields)) {
                result[name] = move[name] ?? _DEFAULTS[name]
                if (!check(result[name])) throw new Error(`invalid ${move.type}.${name}`)
        }
        return result
}

// 手の種類 → 引数の名前の並び。入口が、手を送る関数をここから作る
export const fields = Object.fromEntries(Object.entries(_TABLE).map(([type, checks]) => [type, Object.keys(checks)]))
