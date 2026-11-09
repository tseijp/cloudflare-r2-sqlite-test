import type { Edited, Frame } from '../utils/share/types.ts'
import type { Sql } from './sql.ts'
import type { File } from './vfs.ts'

export const pageSizeOf = (data: Uint8Array) => {
        const raw = (data[16] << 8) | data[17]
        return raw === 1 ? 65536 : raw
}

const framesOf = (file: File, txid: number): Frame[] => {
        const size = pageSizeOf(file.data)
        const pgnos = [...file.dirty].sort((a, b) => a - b)
        const commit = file.size / size
        const last = pgnos.length - 1
        return pgnos.map((pgno, i) => ({ txid, pgno, data: file.data.slice((pgno - 1) * size, pgno * size), commit: i === last ? commit : 0 }))
}

export const createLog = (sql: Sql, file: File, start: number) => {
        let txid = start
        let frames: Frame[] = []
        let isPending = false
        const flush = (): Edited => {
                if (!file.dirty.size || !sql.isIdle()) return { txid, frames: [] }
                txid += 1
                const made = framesOf(file, txid)
                file.dirty.clear()
                frames = frames.concat(made)
                return { txid, frames: made }
        }
        const settle = () => {
                if (!isPending) return
                isPending = false
                if (!sql.isIdle()) sql.query('ROLLBACK')
        }
        const guard = <T>(fn: () => T) => {
                settle()
                return fn()
        }
        const atomic = (fn: () => unknown) => {
                settle()
                isPending = true
                sql.query('BEGIN IMMEDIATE')
                fn()
                sql.query('COMMIT')
                isPending = false
                return flush()
        }
        const since = (n: number) => frames.filter((frame) => frame.txid > n)
        const clear = () => void (frames = [])
        flush()
        return { flush, guard, atomic, since, clear, txid: () => txid }
}

export type Log = ReturnType<typeof createLog>
