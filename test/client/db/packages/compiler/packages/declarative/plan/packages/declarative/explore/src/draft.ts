import { say } from '@test/client-compiler-plan-share'
import type { Dice } from '@test/client-compiler-plan-share'
import { TEXTS } from './pool.ts'
import type { Code } from '@test/client-share'

// 生成が作った page。期待値には使わず、命令の宛先を選ぶためだけに持つ
export interface Sheet {
        name: string
        cols: string[]
        rows: number
}

// 生成の途中の状態。who は今の instance の変数名、last は直前に編集した client
export interface Draft {
        dice: Dice
        seed: number
        size: string
        codes: Code[]
        sheets: Sheet[]
        ids: string[]
        who: string
        last: string
        serial: number
}

export type Move = (draft: Draft) => void

// 1 手を、scenario の 1 文を書く命令にして足す
export const step = (draft: Draft, who: string, verb: string, ...args: unknown[]) => {
        draft.codes.push(['step', say(who, verb, args)])
}

export const act = (draft: Draft, verb: string, ...args: unknown[]) => step(draft, draft.who, verb, ...args)

// 8 文字以上で、他に現れない値。SQL の文に現れないことを見る
export const token = (draft: Draft) => `v${++draft.serial}-${draft.seed}-token`

export const sheet = (draft: Draft) => draft.dice.pick(draft.sheets)

export const client = (draft: Draft) => draft.dice.pick(draft.ids)

// 在る行を主に選ぶ。まだ無い行と、列見出し (0) も少し選ぶ
export const row = (draft: Draft, target: Sheet) => {
        const { dice } = draft
        return dice.weigh([
                [90, dice.int(1, Math.max(1, target.rows))],
                [7, target.rows + dice.int(1, 3)],
                [3, 0],
        ])
}

// まだ使っていない名前を pool から選ぶ。無ければ番号を付ける
export const fresh = (draft: Draft, pool: string[], used: string[]) => {
        const free = pool.filter((name) => !used.includes(name))
        return free.length ? draft.dice.pick(free) : `${draft.dice.pick(pool)} ${++draft.serial}`
}

// cell の確定。本文は、他に現れない値か、種類の違う本文
export const cell = (draft: Draft, target: Sheet, at: unknown) => {
        const { dice } = draft
        const text = dice.isHit(0.5) ? token(draft) : dice.pick(TEXTS)
        const marks = [
                [0, dice.int(1, 9), 'bold', '1'],
                [2, 99, 'color', token(draft)],
        ]
        draft.last = client(draft)
        return {
                type: 'cell',
                id: draft.last,
                page: target.name,
                row: at,
                col: dice.pick(target.cols),
                text,
                marks: marks.slice(0, dice.weigh([[6, 0], [3, 1], [1, 2]])),
        }
}
