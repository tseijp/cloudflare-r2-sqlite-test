import { K, sim } from '../sim.ts'

const t = sim({ title: 'delta を SLOTS 個まで積み、delete の失敗で残った delta が内容に現れない' })
const a = t.node('A')
const u = t.client('u1', a)
const edited = `select count(*) from "p" where "a" like 'edit %'`

await a.open()
await a.run({ type: 'page.add', page: 'p' })
await a.run({ type: 'col.add', page: 'p', col: 'a' })
await a.fill('p', 'a', 1200, 2000)
await a.save()
await t.note('physical な push を直接送る。save の式の最大を超えて SLOTS 個まで')
for (let row = 1; row <= K.SLOTS; row++) {
        await u.cell('p', row, 'a', `edit ${row}`)
        await a.push()
}
await a.expect({ axis: 'chain', store: [0, 1, 2, 3, 4, 5, 6, 7, 8], stat: { deltas: 8 } })
await t.note('9 個目は範囲の外なので送られない。作り直して開くと 8 個の delta を読む')
await u.cell('p', 9, 'a', 'edit 9')
await a.push()
await a.stop()
await a.open()
await a.expect({ axis: 'chain', stat: { deltas: 8 }, sql: edited, rows: [[8]] })
await t.note('merge の put の後の delete が失敗する。save は解決し、古い delta が新しい image の横に残る')
await u.cell('p', 10, 'a', 'edit 10')
await t.store.fail('delete')
await a.save()
await a.expect({ axis: 'chain', error: '', store: [0, 1, 2, 3, 4, 5, 6, 7, 8] })
await t.replica(3).expect({ axis: 'chain', exists: true, linked: false })
await t.note('残った delta は chain の外で、開いた内容に現れない。open が消す')
await a.stop()
await a.open()
await a.expect({ axis: 'chain', store: [0], sql: edited, rows: [[9]] })

export default await t.done()
