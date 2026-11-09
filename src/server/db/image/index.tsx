import { createColumns } from './ddl'
import { createEdit } from './edit'
import { openEngine } from './engine'
import { createLog, pageSizeOf } from './log'
import { createRead } from './read'
import { createStore } from './store'
import type { Image } from '../utils/share/types'

export const createImage = async (bytes: Uint8Array | null, txid = 0): Promise<Image> => {
        const { sql: _sql, file: _file, close } = await openEngine(bytes)
        const _log = createLog(_sql, _file, txid)
        const _cols = createColumns(_sql)
        const _write = createEdit(_sql, _cols, () => _log.txid() + 1)
        const _read = createRead(_sql, _cols)
        const _store = createStore(_sql, _log, _file, _cols, _write.drop)
        return {
                sql: _store.sql,
                declare: (sheet) => _log.atomic(() => _write.declare(sheet)),
                window: (req) => _log.guard(() => _read.window(req)),
                edit: (op) => _log.atomic(() => _write.edit(op)),
                frames: _log.since,
                get txid() {
                        return _log.txid()
                },
                checkpoint: _log.clear,
                bytes: _store.bytes,
                pageSize: pageSizeOf(_file.data),
                orphans: () => _log.guard(_read.orphans),
                schema: () => _log.guard(_read.schema),
                meta: _store.meta,
                close,
        }
}
