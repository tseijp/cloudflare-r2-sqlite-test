import { sim } from '../sim.ts'

const t = sim({ title: 'fixtures の CSV の先頭を、製品の client の file event が作る命令で取り込む' })
const a = t.node('A')
const u = t.client('u1', a)

await a.open()
await a.load('航空券価格予測/business.csv', 300000)
await a.save()
await a.run({ type: 'sql', text: 'select count(*) from "business"' })
await u.cell('business', 1, 'price', '日本語の本文', [[0, 2, 'bold', '1']])
await u.undo()
await u.redo()
await a.save()
await a.audit()
await a.stop()
await a.open()
await a.expect({ axis: '永続', sql: 'select "price" from "business" where "_id" = 1', rows: [['日本語の本文']] })

export default await t.done()
