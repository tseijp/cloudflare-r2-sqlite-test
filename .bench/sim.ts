// 製品と検証を結ぶ 1 か所。製品の code を呼ぶ行と、この repository の事情 (issue の番号、データの置き場) は
// ここにだけある。
// scenario はここから simulation (t)、instance (a、b)、製品の定数 (db)、CSV の取込 (csv) を受け取り、手の列だけを書く
import { closeSync, openSync, readFileSync, readSync } from 'node:fs'
import { basename } from 'node:path'
import * as Y from 'yjs'
import { createGrid } from '@db/client'
import * as db from '@db/server'
import { createSim } from '@test/server'

type Store = Parameters<typeof db.createDb>[0]['store']

type Replica = ReturnType<typeof t.replica>

const { createDb, ...limits } = db

const wasm = await WebAssembly.compile(readFileSync('node_modules/wa-sqlite/dist/wa-sqlite-async.wasm'))

// 製品の instance を 1 つ作る。store は @test/server が渡す模擬 store、doc は新しい yjs の doc。
// view は、製品が doc に載せた表示用の map (contract.md 8 節) を読む
const make = (store: Store) => {
        const doc = new Y.Doc()
        return { db: createDb({ wasm, store, doc }), view: () => doc.getMap('view').toJSON() }
}

// 実時間の打ち切りを、この process を起こした .bench/launch.mjs に頼む
const limit = (seconds: number) => {
        return new Promise((done) => (process.send ? process.send({ limit: seconds }, done) : done(null)))
}

// 判定が付ける崩れの原因 → .bench/issues の番号 (score.md 10 節)
const known = { crossed: '001', ghost: '002', wrote: '003', rolled: '004' }

export const t = createSim({ ...limits, make, limit, known })

export const a = t.replica('A')

export const b = t.replica('B')

// file の先頭 bytes を文字列として読む
const head = (file: string, bytes: number) => {
        const buffer = new Uint8Array(bytes)
        const fd = openSync(file, 'r')
        const text = new TextDecoder().decode(buffer.subarray(0, readSync(fd, buffer, 0, bytes, 0)))
        closeSync(fd)
        return text
}

// fixtures の CSV の先頭 bytes を、製品の client の file event で命令に変え、instance に 1 つずつ送る
export const csv = async (replica: Replica, file: string, bytes: number) => {
        const ops: unknown[] = []
        const grid = createGrid({ doc: new Y.Doc(), id: 'csv', send: async (op: unknown) => ops.push(op) && [] })
        grid.dispatch({ type: 'file', name: basename(file), text: head(`.bench/data/${file}`, bytes) })
        for (let count = -1; count !== ops.length; await new Promise((turn) => setTimeout(turn, 0))) count = ops.length
        await t.mark('rows/csv')
        for (const op of ops) await replica.run(op)
}

export { db }
