// 003 put が書いた後に reject すると、その instance は開き直すまで save できない
import { a, t } from '../sim.ts'

const count = { type: 'sql', text: 'select count(*) from "p"' }

// 5 chunk の image を作って保存する
await a.open()
await a.run({ type: 'page.add', page: 'p' })
await a.run({ type: 'col.add', page: 'p', col: 'a' })
await a.fill('p', 'a', 4400, 2000)
await a.save()

// 次の save の put は、store に書いた後に reject する
await a.fill('p', 'a', 1200, 2000)
await a.fault('put.after', 0)
await a.save()
await a.expect({ axis: '永続', known: '003', error: 'injected put after write', store: [0] })

// 編集も save も読みも通らない
await a.run({ type: 'cell', id: 'u1', page: 'p', row: 1, col: 'a', text: 'lost', marks: [] })
await a.save()
await a.expect({ axis: '永続', known: '003', error: 'store diverged', calls: [['get', 0]] })
await a.run(count)

// 開き直すと、reject した save の内容 (5,600 行) で続行できる。その後の編集は無い
await a.open()
await a.run(count)
await a.expect({ axis: '永続', sql: 'select count(*) from "p"', rows: [[5600]] })
await a.expect({ axis: '永続', sql: `select count(*) from "p" where "a" = 'lost'`, rows: [[0]] })

export default await t.done()
