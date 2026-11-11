// 005 終わらない sql。20 秒で起動側が打ち切る (exit 124)
import { a, t } from '../sim.ts'

await t.limit(20)
await a.open()
await a.run({ type: 'sql', text: 'select 1' })
// 上限の無い再帰 CTE。この手は終わらない
const endless = 'with recursive c(n) as (select 1 union all select n + 1 from c) select count(*) from c'
await a.run({ type: 'sql', text: endless })

export default await t.done()
