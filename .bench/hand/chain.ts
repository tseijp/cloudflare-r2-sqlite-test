// save の式に依らずに delta を SLOTS 個まで積み、delete の失敗で残った delta が内容に現れないことを見る
import { a, db, t } from '../sim.ts'

const edit = (row: number) => ({ type: 'cell', id: 'u1', page: 'p', row, col: 'a', text: `edit ${row}`, marks: [] })

await a.open()
await a.run({ type: 'page.add', page: 'p' })
await a.run({ type: 'col.add', page: 'p', col: 'a' })
await a.fill('p', 'a', 1200, 2000)
await a.save()

// physical な push を直接送る。式の最大を超えて SLOTS (8) 個まで
for (let row = 1; row <= db.SLOTS; row++) {
        await a.run(edit(row))
        await a.push()
}
await a.expect({ axis: '鎖', store: [0, 1, 2, 3, 4, 5, 6, 7, 8], stat: { deltas: 8, patch: 16 } })

// 9 個目は範囲の外なので送られない。作り直して開くと、8 個の delta を読む
await a.run(edit(9))
await a.push()
await a.stop()
await a.open()
const edited = `select count(*) from "p" where "a" like 'edit %'`
await a.expect({ axis: '鎖', stat: { deltas: 8 }, sql: edited, rows: [[8]] })

// merge の put の後の delete が失敗する。save は解決し、古い delta が新しい image の横に残る
await a.run(edit(10))
await a.fault('delete', 0)
await a.save()
await a.expect({ axis: '鎖', error: '', store: [0, 1, 2, 3, 4, 5, 6, 7, 8] })

// 残った delta は鎖の外で、開いた内容に現れない。open が消す
await a.stop()
await a.open()
await a.expect({ axis: '鎖', store: [0], sql: edited, rows: [[9]] })

export default await t.done()
