import * as Y from 'yjs'
import { CONFIG } from './const'
import { createEngine } from './engine'
import { createReplica } from './replica'
import { createTable } from './table'
import { createWindow } from './window'
import type { Input } from '../procedural/share/types'

export type * from '../procedural/share/types'

export const openDb = async (input: Input = {}) => {
        const replica = input.storage ? createReplica(input.storage, { ...CONFIG.replica, prefix: input.prefix ?? '' }) : null
        const source = await replica?.open()
        const engine = await createEngine({ ...CONFIG.engine, ...source, wasm: input.wasm, commit: source?.commit ?? 0 })
        const table = await createTable(engine, CONFIG.table)
        const window = await createWindow(input.doc ?? new Y.Doc(), table, CONFIG.window)
        const image = () => table.drop().then(() => engine.bytes(true))
        return {
                ...window,
                schema: table.schema,
                async save() {
                        return (replica ? replica.save(engine.take(), image) : null)
                },
                bytes() {
                        return engine.bytes(false)
                },
                close: engine.close,
                pageSize: engine.pageSize,
                txid() {
                        return replica?.txid ?? 0
                },
        }
}

export type Db = Awaited<ReturnType<typeof openDb>>
