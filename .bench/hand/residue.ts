import { sim } from '../sim.ts'

const t = sim({ title: 'delete の失敗で残った delta は内容に現れない' })
const a = t.node('A')
const u = t.client('u1', a)

await t.state({ chunks: 3, deltas: 2, patch: 40 })
await a.open()
await a.expect({ axis: 'chain', chunks: 3, stat: { deltas: 2 } })
await u.cell('p', 1, 'a', 'kept')
await t.replica(1).fail('delete')
await a.merge()
await t.replica(1).expect({ exists: true, linked: false })
await a.stop()
await a.open()
await t.store.expect({ seqs: [0] })
await a.expect({ axis: 'chain', sql: 'select "a" from "p" where "_id" = 1', rows: [['kept']] })

export default await t.done()
