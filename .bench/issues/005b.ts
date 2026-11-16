import { sim } from '../sim.ts'

const t = sim({ title: '005 終わらない sql。BENCH_LIMIT=20 で起動側が打ち切る (exit 124)' })
const a = t.node('A')
const endless = 'with recursive c(n) as (select 1 union all select n + 1 from c) select count(*) from c'

await a.open()
await a.run({ type: 'sql', text: 'select 1' })
await a.run({ type: 'sql', text: endless })

export default await t.done()
