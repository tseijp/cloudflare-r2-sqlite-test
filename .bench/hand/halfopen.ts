import { sim } from '../sim.ts'

const t = sim({ title: 'open の途中 (delta の get) が失敗した後の node' })
const a = t.node('A')
const u = t.client('u1', a)
const count = (text: string) => `select count(*) from "p" where "a" = '${text}'`

await t.state({ chunks: 2 })
await a.open()
await u.cell('p', 1, 'a', 'saved in delta')
await a.save()
await a.expect({ axis: '永続', store: [0, 1], stat: { deltas: 1 }, sql: count('saved in delta'), rows: [[1]] })
await t.note('開き直しの 2 回目の get (delta 1) が失敗する。open は reject する')
await t.replica(1).fail('get')
await a.open()
await a.expect({ axis: '原子', error: 'injected get' })
await t.note('期待: store の delta 1 つを知っていて、保存済みの内容が見える')
await a.expect({ axis: '原子', known: '007', stat: { deltas: 1 }, sql: count('saved in delta'), rows: [[1]] })
await t.note('小さい変更を足して save する (push になる量)。期待: 解決する')
await u.cell('p', 1, 'a', 'after failed open')
await a.save()
await a.expect({ axis: '永続', known: '007', error: '' })
await t.note('開き直すと、保存済みの内容で続行できる。失敗した save の変更は無い')
await a.open()
await a.expect({ axis: '永続', stat: { deltas: 1 }, sql: count('saved in delta'), rows: [[1]] })

export default await t.done()
