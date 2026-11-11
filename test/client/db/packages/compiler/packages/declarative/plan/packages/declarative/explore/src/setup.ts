import { lit, say } from '@test/client-compiler-plan-share'
import { act, cell, fresh, step } from './draft.ts'
import { COLS, FILES, PAGES } from './pool.ts'
import type { Draft } from './draft.ts'

// 大きい table の行数を、製品の定数の式で書く。1 行は半 page ほどなので、行数は page 数の 2 倍
const _ROWS: Record<string, (part: number) => string> = {
        // 2 chunk 〜 ROOM chunk
        few: (part) => `Math.round(2 * db.CHUNK * (1.1 + ${part} * (db.ROOM - 1.2)))`,
        // ROOM chunk 超 〜 上限の 1 chunk 手前
        many: (part) => `Math.round(2 * db.CHUNK * (db.ROOM + 0.2 + ${part} * (db.LIMIT / db.CHUNK - db.ROOM - 1.4)))`,
        // 上限 LIMIT の手前。残りは 1 chunk 未満
        near: (part) => `2 * (db.LIMIT - Math.round(db.CHUNK * (0.2 + ${part} * 0.6)))`,
}

const _HALF = { $code: 'db.PAGE / 2 - 48' }

// save の式に依らず、delta を SLOTS の part 倍まで積む 1 文
const _stack = (draft: Draft, part: number) => {
        const edit = say(draft.who, 'run', [cell(draft, draft.sheets[0], { $code: 'index' })], '        ')
        const push = say(draft.who, 'push', [], '        ')
        return [`for (let index = 1; index <= Math.round(db.SLOTS * ${part}); index++) {`, edit, push, '}'].join('\n')
}

// page を 1 〜 3 つ作る
const _pages = (draft: Draft) => {
        for (let count = draft.dice.int(1, 3); count > 0; count--) {
                const name = fresh(draft, PAGES, draft.sheets.map((item) => item.name))
                const cols = [draft.dice.pick(COLS)]
                act(draft, 'run', { type: 'page.add', page: name })
                act(draft, 'run', { type: 'col.add', page: name, col: cols[0] })
                draft.sheets.push({ name, cols, rows: 0 })
        }
}

// 行を置く。最初の page は layer の大きさまで直接の SQL で、全ての page に生成した行の取込を足す
const _rows = (draft: Draft, part: number) => {
        const { dice, size } = draft
        const [bulk] = draft.sheets
        const count = { $code: _ROWS[size]?.(part) }
        // 大きい table の本文は、圧縮の効く繰り返し (直接の SQL) か、効きにくい語の並び (取込)
        if (size !== 'one' && dice.isHit(0.6)) act(draft, 'fill', bulk.name, bulk.cols[0], count, _HALF)
        else if (size !== 'one') act(draft, 'load', bulk.name, bulk.cols, count, _HALF, ++draft.serial)
        if (size !== 'one') bulk.rows = 1000
        for (const target of draft.sheets) {
                const count = dice.int(3, 60)
                act(draft, 'load', target.name, target.cols, count, dice.pick([8, 40, 200]), ++draft.serial)
                target.rows += count
        }
        // fixtures の CSV の先頭を、製品の client を通して取り込む
        const file = `await csv(${draft.who}, ${lit(dice.pick(FILES))}, ${dice.int(20, 200) * 1000})`
        if (size !== 'near' && dice.isHit(0.2)) draft.codes.push(['step', file])
}

// 長く使った後の状態を、製品の命令と physical な命令で直接置く。page、行、image、delta、窓
export const setup = (draft: Draft) => {
        const { dice, size } = draft
        const part = () => dice.int(0, 100) / 100
        act(draft, 'open')
        _pages(draft)
        _rows(draft, part())
        act(draft, 'save')
        if (size !== 'one' && dice.isHit(0.7)) draft.codes.push(['step', _stack(draft, part())])
        if (dice.isHit(0.5)) {
                act(draft, 'stop')
                act(draft, 'open')
        }
        for (const id of draft.ids) {
                const target = dice.pick(draft.sheets)
                act(draft, 'run', { type: 'window', id, page: target.name, top: dice.int(0, target.rows), size: 30 })
        }
        step(draft, 't', 'measure')
}
