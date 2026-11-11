// 永続/save の崩れが残るように 30 回の試行で縮めた列
// seed 5: image few、save rare、open と save の比 save、client 5
import { a, b, csv, db, t } from '../sim.ts'

await a.open()
await a.run({ type: 'page.add', page: 'ページ' })
await a.run({ type: 'col.add', page: 'ページ', col: '50%' })
await a.run({ type: 'col.add', page: '100%', col: "q\"c" })
await a.fill('ページ', '50%', Math.round(2 * db.CHUNK * (1.1 + 0.91 * (db.ROOM - 1.2))), db.PAGE / 2 - 48)
await a.load('ページ', ['50%'], 48, 200, 1)
await a.load('p', ['50%'], 13, 300, 5)
await a.run({
        type: 'cell',
        id: 'u5',
        page: '100%',
        row: 10,
        col: "q\"c",
        text: 'v6-5-token',
        marks: [[0, 2, 'bold', '1'], [2, 99, 'color', 'v7-5-token']],
})
await a.save()
await a.run({ type: 'undo', id: 'u5' })
await a.run({ type: 'window', id: 'u3', page: 'ページ', top: 84, size: 200 })
await a.run({
        type: 'cell',
        id: 'u3',
        page: 'ページ',
        row: 770,
        col: '50%',
        text: "line\nbreak",
        marks: [[0, 8, 'bold', '1']],
})
await a.fault('get', 1)
await a.run({ type: 'sql', text: "select count(*) from \"_style\"" })
await a.save()
await a.save()
await a.open()
await a.run({ type: 'style', id: 'u2', page: 'p', row: 14, col: '50%', name: 'border-top', value: 'v9-5-token' })
await a.run({ type: 'redo', id: 'u2' })
await a.run({ type: 'cell', id: 'u1', page: 'ページ', row: 737, col: '50%', text: '長い本文 '.repeat(1000), marks: [] })
await a.fault('put', 0)
await a.save()
await a.save()
await a.open()

export default await t.done()
