// 005 重い sql を止める仕組みが無く、その間ほかの命令も timer も進まない
import { a, t } from '../sim.ts'

const numbers = 'with recursive c(n) as (select 1 union all select n + 1 from c where n < 10000000)'
const heavy = `${numbers} select count(*) from c`

await t.limit(120)
await a.open()
await a.run({ type: 'sql', text: 'select 1' })

// 実時間の観測 (判定には使わない)。100 ms 後に timer を予約し、重い sql の直後に select 1 を送る
const started = Date.now()
const timer = new Promise<number>((resolve) => setTimeout(() => resolve(Date.now() - started), 100))
const slow = a.run({ type: 'sql', text: heavy }).then(() => Date.now() - started)
const quick = a.run({ type: 'sql', text: 'select 1' }).then(() => Date.now() - started)

// 重い sql は製品と twin で 1 回ずつ走る。その間、後の命令も timer も進まない
process.stdout.write(`重い sql: ${await slow} ms 後に解決\n`)
process.stdout.write(`直後に送った select 1: ${await quick} ms 後に解決\n`)
process.stdout.write(`100 ms 後に予約した timer: ${await timer} ms 後に進んだ\n`)

export default await t.done()
