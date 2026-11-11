// CSV の空行は捨てられる (fixtures.md 3 節)。製品の client の file event が送る命令の rows を見る
import * as Y from 'yjs'
import { createGrid } from '@db/client'
import { t } from '../sim.ts'

const ops: { rows?: unknown[] }[] = []
const grid = createGrid({ doc: new Y.Doc(), id: 'csv', send: async (op: { rows?: unknown[] }) => ops.push(op) && [] })

grid.dispatch({ type: 'file', name: 'blank.csv', text: 'a,b\r\n1,2\r\n\r\n5,6\r\n,\r\n' })
await new Promise((turn) => setTimeout(turn, 10))
process.stdout.write(`rows ${JSON.stringify(ops.map((op) => op.rows))}\n`)

export default await t.done()
