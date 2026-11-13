// open の途中 (delta の get) が失敗した後の instance。seed 5 の崩れ (.bench/fails/000005.ts) から手で書き直した列
import { a, t } from '../sim.ts'

const edit = (text: string) => ({ type: 'cell', id: 'u1', page: 'p', row: 1, col: 'a', text, marks: [] })
const count = (text: string) => ({ sql: 'select count(*) from "p" where "a" = ?', params: [text] })

// 2 chunk の image と、delta 1 つ。delta には「saved in delta」が入っている
await a.open()
await a.run({ type: 'page.add', page: 'p' })
await a.run({ type: 'col.add', page: 'p', col: 'a' })
await a.fill('p', 'a', 1200, 2000)
await a.save()
await a.run(edit('saved in delta'))
await a.save()
await a.expect({ axis: '永続', store: [0, 1], stat: { deltas: 1 }, ...count('saved in delta'), rows: [[1]] })

// 開き直しの 2 回目の get (delta 1) が失敗する。open は reject する
await a.fault('get', 1)
await a.open()
await a.expect({ axis: '原子', error: 'injected get' })

// 期待: store の delta 1 つを知っていて、保存済みの内容が見える
await a.expect({ axis: '原子', stat: { deltas: 1 }, ...count('saved in delta'), rows: [[1]] })

// 小さい変更を足して save する (push になる量)。期待: 解決する
await a.run(edit('after failed open'))
await a.save()
await a.expect({ axis: '永続', error: '' })

// 開き直すと、保存済みの内容で続行できる。失敗した save の変更は無い
await a.open()
await a.expect({ axis: '永続', stat: { deltas: 1 }, ...count('saved in delta'), rows: [[1]] })

export default await t.done()
