// 作り直した instance の最初の open が get の失敗で reject した後に、命令を送る。
// seed 28 と 36 の崩れ (.bench/fails/000028.ts、000036.ts) から手で書き直した列
import { a, t } from '../sim.ts'

await a.open()
await a.run({ type: 'page.add', page: 'p' })
await a.run({ type: 'col.add', page: 'p', col: 'a' })
await a.run({ type: 'row.add', page: 'p' })
await a.save()

// 作り直しの後の open の get が失敗する
await a.stop()
await a.fault('get', 0)
await a.open()
await a.expect({ axis: '原子', error: 'injected get' })

// 開いていない instance への命令。contract.md に決まりは無い。観測した結果は下の行に出る
await a.run({ type: 'row.add', page: 'p' })
await a.run({ type: 'sql', text: 'select count(*) from "p"' })
await a.save()

// 開き直すと、保存済みの内容で続行できる
await a.open()
await a.expect({ axis: '原子', sql: 'select count(*) from "p"', rows: [[1]] })

export default await t.done()
