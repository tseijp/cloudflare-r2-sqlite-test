import { sim } from '../sim.ts'

const t = sim({ title: '006 chunk 数が ROOM を超える database では、全走査のたびに chunk を読み直す' })
const a = t.node('A')
const scan = { type: 'sql', text: 'select count(*), total(length("a")) from "big"' }
const near = { type: 'sql', text: 'select "_id" from "big" where "_id" >= 100 order by "_id" limit 5' }

await t.note('6 chunk の image を保存し、作り直して開く')
await a.open()
await a.run({ type: 'page.add', page: 'big' })
await a.run({ type: 'col.add', page: 'big', col: 'a' })
await a.fill('big', 'a', 11000, 1000)
await a.save()
await a.stop()
await a.open()
await a.expect({ axis: '回数', chunks: 6, stat: { deltas: 0 } })
await t.note('同じ全走査を 3 回。期待: 2 回目からは memory から返る')
await a.run(scan)
await a.run(scan)
await a.expect({ axis: '回数', known: '006', calls: 0 })
await a.run(scan)
await a.expect({ axis: '回数', known: '006', calls: 0 })
await t.note('_id の範囲だけを読む sql を 3 回')
await a.run(near)
await a.run(near)
await a.expect({ axis: '回数', calls: 0 })
await a.run(near)
await a.expect({ axis: '回数', calls: 0 })

export default await t.done()
