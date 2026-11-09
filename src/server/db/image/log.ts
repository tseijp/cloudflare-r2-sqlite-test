import type { Edited, Frame } from '../utils/share/types.ts'
import type { Sql } from './sql.ts'
import type { File } from './vfs.ts'

export const pageSizeOf = (data: Uint8Array) => {
        const raw = (data[16] << 8) | data[17]
        return raw === 1 ? 65536 : raw
}

const _framesOf = (file: File, txid: number): Frame[] => {
        const size = pageSizeOf(file.data)
        const pgnos = [...file.dirty].sort((a, b) => a - b)
        const commit = file.size / size
        const last = pgnos.length - 1
        return pgnos.map((pgno, i) => ({ txid, pgno, data: file.data.slice((pgno - 1) * size, pgno * size), commit: i === last ? commit : 0 }))
}

export const createLog = (sql: Sql, file: File, start: number) => {
        let _txid = start
        let _frames: Frame[] = []
        let _isPending = false
        const flush = (): Edited => {
                if (!file.dirty.size || !sql.isIdle()) return { txid: _txid, frames: [] }
                _txid += 1
                const made = _framesOf(file, _txid)
                file.dirty.clear()
                _frames = _frames.concat(made)
                return { txid: _txid, frames: made }
        }
        const _settle = () => {
                if (!_isPending) return
                _isPending = false
                if (!sql.isIdle()) sql.query('ROLLBACK')
        }
        flush()
        return {
                flush,
                guard: <T>(fn: () => T) => {
                        _settle()
                        return fn()
                },
                atomic: (fn: () => unknown) => {
                        _settle()
                        _isPending = true
                        sql.query('BEGIN IMMEDIATE')
                        fn()
                        sql.query('COMMIT')
                        _isPending = false
                        return flush()
                },
                since: (n: number) => _frames.filter((frame) => frame.txid > n),
                clear: () => void (_frames = []),
                txid: () => _txid,
        }
}

export type Log = ReturnType<typeof createLog>
