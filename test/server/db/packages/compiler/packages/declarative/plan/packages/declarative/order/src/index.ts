import { fill, rows, texts, title, values } from '@test/server-compiler-plan-order-data'
import { order, save } from '@test/server-compiler-plan-share'
import { canPush, MARK } from '@test/server-share'
import type { Plan } from '@test/server-compiler-plan-share'
import type { Code, Summary } from '@test/server-share'
import type { Op } from '@test/server-compiler-plan-order-data'

// 命令の後に並べる判定と記録。どの命令にも同じ並びで、効くかどうかは製品が compile した命令列で決まる
const _after = (on: string, label: string): Code[] => [
        ['judge', 'view', on],
        ['judge', 'tidy', on],
        ['judge', 'bound', on, 0],
        ['account', on, 'read'],
        ['trace', on, label],
]

// 製品に logical な命令を 1 つ送る手。前に観測、後に twin への同じ命令と判定を並べる
const _send = (on: string, op: Op, verdict: Code[]): Code[] => [
        ['begin', on],
        ['text', texts(op)],
        ['judge', 'compile', on, op, values(op)],
        ['recall', on],
        ['judge', 'styled', on],
        ['send', on, op],
        ['mirror', on, op],
        ['judge', 'parity', on],
        ...verdict,
        ['touch', on, op.type],
        ['views', on, op.id ?? '', op.size ?? 0],
        ['learn', on],
        ['judge', 'history', on],
        ['judge', 'rows', on],
        ['judge', 'kept', on],
        ..._after(on, title(op)),
]

// 製品に physical な命令を直接送る手。twin にも同じ命令を送る
const _pipe = (on: string, codes: Code[], label: string): Code[] => [
        ['begin', on],
        ['pipe', on, codes],
        ['relay', on, codes],
        ['judge', 'parity', on],
        ['touch', on, 'exec'],
        ..._after(on, label),
]

// reject を期待する命令の軸。sql は履歴、取込は上限、他は compile
const _AXES: Record<string, string> = { sql: '履歴', import: '上限' }

// 製品が reject するはずの命令の判定。内容は直前のままである
const _refusal = (on: string, type: string): Code[] => [
        ['judge', 'refuse', on, _AXES[type] ?? 'compile'],
        ['judge', 'intact', on],
        ['mark', `reject/${type}`],
]

// physical な push / merge を直接送る。範囲の外なら送らずに記録だけを残す
const _direct = (on: string, kind: string, isAllowed: boolean): Code[] => {
        if (!isAllowed) return [['begin', on], ['note', `${on} ${kind} は範囲の外なので送らない`]]
        return save(on, kind, ['pipe', on, [[kind]]])
}

// push を直接送ってよいか (score.md 3 節)
const _isPushable = (stat: Summary, on: string) => {
        const seat = stat.seats[on]?.stat
        return !!seat && seat.dirty > 0 && canPush(stat, seat.base, seat.deltas, seat.patch + seat.dirty)
}

// 製品に命令を送る手
export const orders: Record<string, Plan> = {
        run: ({ on, op }) => ((op as Op).type === 'save' ? save(on, 'save', order(on)) : _send(on, op as Op, [])),
        save: ({ on }) => save(on, 'save', order(on)),
        reject: ({ on, op }) => _send(on, op as Op, _refusal(on, (op as Op).type)),
        // 制約の外の入力。compile が例外を投げ、run が reject する
        invalid: ({ on, op }) => {
                const verdict: Code[] = [['judge', 'throws', on], ['judge', 'refuse', on, 'compile']]
                return _send(on, op as Op, [...verdict, ['mark', MARK.outside]])
        },
        exec: ({ on, codes }) => {
                const isSave = (codes as Code[]).some(([code]) => code === 'push' || code === 'merge')
                if (isSave) throw new Error('push と merge は push() / merge() の手で送る')
                return _pipe(on, codes as Code[], `exec ${JSON.stringify(codes).slice(0, 96)}`)
        },
        fill: ({ on, page, col, rows: count, size }) => {
                const label = `fill ${page}.${col} ${count} 行 × ${size} 文字`
                const code = fill(page as string, col as string, count as number, size as number)
                return [['mark', MARK.filled], ..._pipe(on, [code], label)]
        },
        // 生成した行を取り込む。over が 1 なら、上限を超える取込として reject を期待する
        load: ({ on, page, names, rows: count, size, salt, over }) => {
                const made = rows(count as number, (names as string[]).length, size as number, salt as number)
                const op = { type: 'import', page: page as string, names: names as string[], rows: made }
                return [['mark', MARK.generated], ..._send(on, op, over ? _refusal(on, 'import') : [])]
        },
        push: ({ on }, stat) => _direct(on, 'push', _isPushable(stat, on)),
        merge: ({ on }, stat) => _direct(on, 'merge', (stat.seats[on]?.stat.dirty ?? 0) > 0),
}
