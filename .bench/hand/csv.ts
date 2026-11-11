// fixtures の CSV の先頭を、製品の client の file event で命令に変えて取り込む
import { a, csv, t } from '../sim.ts'

await a.open()
// 先頭 300,000 byte。client は 2,000 行ずつの import と、最後に window を送る
await csv(a, '航空券価格予測/business.csv', 300000)
await a.save()
await a.run({ type: 'sql', text: 'select count(*) from "business"' })
const marks = [[0, 2, 'bold', '1']]
await a.run({ type: 'cell', id: 'u1', page: 'business', row: 1, col: 'price', text: '日本語の本文', marks })
await a.run({ type: 'undo', id: 'u1' })
await a.run({ type: 'redo', id: 'u1' })
await a.save()
await a.stop()
await a.open()
await a.expect({ axis: '永続', sql: 'select "price" from "business" where "_id" = 1', rows: [['日本語の本文']] })

export default await t.done()
