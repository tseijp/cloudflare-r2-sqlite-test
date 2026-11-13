// 004 rollback された書き込みの後の save が、内容の同じ page を put する
import { a, t } from '../sim.ts'

// 空の page を保存する
await a.open()
await a.run({ type: 'page.add', page: 'p' })
await a.run({ type: 'col.add', page: 'p', col: 'a' })
await a.save()

// 上限 (LIMIT page) を超える取込は reject し、rollback される。行数は 0 のままである
await a.load('p', ['a'], 8500, 4000, 1, 1)
await a.expect({ axis: '上限', error: 'database or disk is full', sql: 'select count(*) from "p"', rows: [[0]] })

// 期待: 変化が無いので store を呼ばない。観測: put を 1 回呼ぶ
await a.save()
await a.expect({ axis: '回数', known: '004', calls: [] })

// 2 回目は store を呼ばない
await a.save()
await a.expect({ axis: '回数', calls: [] })

export default await t.done()
