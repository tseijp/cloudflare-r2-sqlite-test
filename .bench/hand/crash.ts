// store の呼び出しの途中で instance を失う。進行中の put は、届くことも届かないこともある
import { a, b, t } from '../sim.ts'

const edit = (text: string) => ({ type: 'cell', id: 'u1', page: 'p', row: 1, col: 'a', text, marks: [] })
const count = (text: string) => ({ axis: '原子', sql: 'select count(*) from "p" where "a" = ?', params: [text] })

await a.open()
await a.run({ type: 'page.add', page: 'p' })
await a.run({ type: 'col.add', page: 'p', col: 'a' })
await a.fill('p', 'a', 1200, 2000)
await a.save()

// push の put を store の手前で止め、instance を失う。put は届かない
await a.run(edit('never arrives'))
await a.hold()
await a.save()
await a.stop()
await a.release('lose')
await a.open()
await a.expect({ ...count('never arrives'), rows: [[0]] })

// 同じことをして、put は届く
await a.run(edit('arrives late'))
await a.hold()
await a.save()
await a.stop()
await a.release('arrive')
await a.open()
await a.expect({ ...count('arrives late'), rows: [[1]], store: [0, 1] })

// 古い instance の put が進行中に、新しい instance が同じ store を開いて書く。後から届いた put は入らない
await a.run(edit('old writer'))
await a.hold()
await a.save()
await b.open()
await b.run(edit('new writer'))
await b.save()
await a.release('arrive')
await a.expect({ axis: '単一書き', error: 'store conflict' })
await a.stop()
await b.expect({ ...count('new writer'), rows: [[1]], store: [0, 1, 2] })

export default await t.done()
