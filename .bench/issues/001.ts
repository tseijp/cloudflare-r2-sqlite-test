// 001 writer が 2 つのとき、merge と push の交差で保存済みの変更が消える
import { a, b, t } from '../sim.ts'

const edit = (text: string) => ({ type: 'cell', id: 'u2', page: 'p', row: 1, col: 'a', text, marks: [] })

// 2 chunk 以上の image を作り、同じ store を A と B が開く
await a.open()
await a.run({ type: 'page.add', page: 'p' })
await a.run({ type: 'col.add', page: 'p', col: 'a' })
await a.fill('p', 'a', 1200, 2000)
await a.save()
await b.open()

// 形 1: B が push に成功する。その push を知らない A が merge する
await b.run(edit('saved by B'))
await b.save()
await a.fill('p', 'a', 1200, 2000)
await a.save()
await a.expect({ axis: '単一書き', known: '001', error: 'store conflict' })
await b.expect({ axis: '単一書き', known: '001', store: [0, 1] })

// 形 2: A が merge に成功した。その merge を知らない B が push する
await b.run(edit('saved by B again'))
await b.save()
await b.expect({ axis: '単一書き', known: '001', error: 'store conflict' })

// 開き直すと、B が成功と受け取った save の内容は無い
await a.open()
await a.expect({ axis: '永続', known: '001', sql: 'select "a" from "p" where "_id" = 1', rows: [['saved by B again']] })

export default await t.done()
