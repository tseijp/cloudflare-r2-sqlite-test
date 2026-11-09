import { LIMIT } from './utils/config/config.ts'
import { META } from './utils/share/const.ts'
import type { Row, Value } from '../utils/share/types.ts'
import type { Columns } from './ddl.ts'
import type { Log } from './log.ts'
import type { Sql } from './sql.ts'
import type { File } from './vfs.ts'

const _UPSERT = `INSERT INTO ${META} (key, bytes) VALUES (?, ?) ON CONFLICT DO UPDATE SET bytes = excluded.bytes WHERE bytes IS NOT excluded.bytes`

export const createStore = (sql: Sql, log: Log, file: File, cols: Columns, drop: () => void) => {
        return {
                sql: (text: string, params?: Value[] | Row) =>
                        log.guard(() => {
                                const result = sql.query(text, params, LIMIT)
                                log.flush()
                                return result
                        }),
                meta: {
                        get: (key: string) => log.guard(() => (sql.query(`SELECT bytes FROM ${META} WHERE key = ?`, [key]).rows[0]?.bytes ?? null) as Uint8Array | null),
                        set: (key: string, bytes: Uint8Array) => void log.atomic(() => sql.query(_UPSERT, [key, bytes])),
                },
                bytes: () =>
                        log.guard(() => {
                                if (cols.hidden().length) log.atomic(drop)
                                return file.data.slice(0, file.size)
                        }),
        }
}
