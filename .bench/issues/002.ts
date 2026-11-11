// 002 まだ無い行への cell が履歴に残り、後でできた行に redo が書く
import { a, t } from '../sim.ts'

await a.open()
await a.run({ type: 'page.add', page: 'p' })
await a.run({ type: 'col.add', page: 'p', col: 'a' })
// 行 1 はまだ無い。命令は解決し、履歴に 1 つ積まれる
await a.run({ type: 'cell', id: 'u1', page: 'p', row: 1, col: 'a', text: 'ghost', marks: [] })
// _id 1 の行ができる。本文は null
await a.run({ type: 'row.add', page: 'p' })
await a.run({ type: 'undo', id: 'u1' })
await a.run({ type: 'redo', id: 'u1' })
// 期待: 無い行への編集は、後からできた行に影響しない
await a.expect({ axis: '履歴', known: '002', sql: 'select * from "p"', rows: [[1, null]] })

export default await t.done()
