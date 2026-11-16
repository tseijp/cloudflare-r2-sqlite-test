import { sim } from '../sim.ts'

const t = sim({ title: '005 重い sql を止める仕組みが無く、その間ほかの命令が全て待たされる' })
const a = t.node('A')
const heavy = 'with recursive c(n) as (select 1 union all select n + 1 from c where n < 10000000) select count(*) from c'
const started = Date.now()

await a.open()
await a.run({ type: 'sql', text: 'select 1' })
await a.run({ type: 'sql', text: heavy })
await t.note(`重い sql は node と shadow で 1 回ずつ走り、${Date.now() - started} ms 後に解決した (実時間。判定には使わない)`)
await t.note('期待: 上限を超える文は reject する')
await a.expect({ axis: '可用', known: '005', error: true })

export default await t.done()
