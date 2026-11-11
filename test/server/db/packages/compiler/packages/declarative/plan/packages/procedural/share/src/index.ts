import type { Code, Move, Summary } from '@test/server-share'

export type Plan = (move: Move, stat: Summary) => Code[]

const _SAVE = { type: 'save' }

// store に書く手の後に並べる判定と記録。順序は、費用 → 判定 → store と揃える → 1 行
export const settle = (on: string, kind: string, label = kind): Code[] => [
        ['account', on, kind],
        ['judge', 'unique'],
        ['judge', 'durable', on],
        ['judge', 'writer', on],
        ['judge', 'chain', on],
        ['judge', 'bound', on, 1],
        ['sync', on],
        ['trace', on, label],
]

// save の 1 手。send は製品への送り方 (logical な save か、physical な push / merge)
export const save = (on: string, kind: string, send: Code): Code[] => {
        const [account, ...rest] = settle(on, kind)
        const head: Code[] = [['begin', on], ['judge', 'compile', on, _SAVE, []], send, account]
        return [...head, ['judge', 'saved', on], ['judge', 'calls', on, 1], ...rest]
}

export const order = (on: string): Code => ['send', on, _SAVE]

// 記録だけを残す手
export const note = (on: string, text: string, body: Code[]): Code[] => [['begin', on], ...body, ['note', text]]
