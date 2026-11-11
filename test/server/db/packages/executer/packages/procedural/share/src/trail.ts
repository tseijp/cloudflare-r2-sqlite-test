import type { Code } from '@test/server-share'
import type { Call, Replica } from './types.ts'

// 製品が store に対して呼ぶ method
export const OPS = ['get', 'put', 'delete']

// store の内容を変えた記録。put、届いた put、写しの貼り付け
const _WRITES = ['put', 'arrive', 'paste']

// 製品の physical な命令のうち、SQL に書くもの (contract.md 7 節)
const _WRITERS = ['sql', 'undo', 'redo']

// この手の間に、その instance が store に対して行ったこと
export const mine = (log: Call[], replica: Replica) => log.slice(replica.at).filter((call) => call.who === replica.name)

export const calls = (log: Call[], replica: Replica) => mine(log, replica).filter((call) => OPS.includes(call.op))

export const isHit = (log: Call[], replica: Replica) => mine(log, replica).some((call) => call.hit !== '')

// この手で、その instance の put が store に入ったもの
export const applied = (log: Call[], replica: Replica) =>
        mine(log, replica).filter((call) => call.done !== '' && _WRITES.includes(call.op))

// 最後に store と揃ってから、この手の前までに、他が store に書いたもの
export const others = (log: Call[], replica: Replica) => {
        const between = log.slice(replica.seen, replica.at)
        return between.filter((call) => call.who !== replica.name && call.done !== '' && _WRITES.includes(call.op))
}

export const isStale = (log: Call[], replica: Replica) => others(log, replica).length > 0

export const shape = (call: Call) => {
        if (call.op === 'get') return ['get', call.seq, call.offset, call.length]
        if (call.op === 'delete' || call.op === 'paste') return [call.op, call.seqs]
        return [call.op, call.seq, call.tag]
}

export const kind = (call: Call) => (call.op === 'paste' || call.seq === 0 ? 'image' : 'delta')

// 製品が compile した命令列から、その名前の命令を 1 つ取り出す
export const find = (codes: Code[] | null, names: string[]) => (codes ?? []).find(([code]) => names.includes(code))

// 製品が compile した命令列が SQL に書くか
export const isWrite = (codes: Code[] | null) => !!find(codes, _WRITERS)
