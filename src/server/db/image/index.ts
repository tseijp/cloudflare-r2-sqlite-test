import { createColumns } from './ddl.ts'
import { createEdit } from './edit.ts'
import { openEngine } from './engine.ts'
import { createLog, pageSizeOf } from './log.ts'
import { createRead } from './read.ts'
import { createStore } from './store.ts'
import type { Image } from '../utils/share/types.ts'

export const createImage = async (bytes: Uint8Array | null, txid = 0): Promise<Image> => {
        const { sql, file, close } = await openEngine(bytes)
        const log = createLog(sql, file, txid)
        const cols = createColumns(sql)
        const write = createEdit(sql, cols, () => log.txid() + 1)
        const read = createRead(sql, cols)
        const store = createStore(sql, log, file, cols, write.drop)
        return {
                sql: store.sql,
                declare: (sheet) => log.atomic(() => write.declare(sheet)),
                window: (req) => log.guard(() => read.window(req)),
                edit: (op) => log.atomic(() => write.edit(op)),
                frames: log.since,
                get txid() {
                        return log.txid()
                },
                checkpoint: log.clear,
                bytes: store.bytes,
                pageSize: pageSizeOf(file.data),
                orphans: () => log.guard(read.orphans),
                schema: () => log.guard(read.schema),
                meta: store.meta,
                close,
        }
}
