import { quoteId } from './inspect.mjs'
import { attempt, jsonBytes, rowsOf } from './product.mjs'

const dumpOf = (db) => attempt(() => db.window.dump())

export const measureObserve = async ({ full, tenth, w, isSmall }) => {
        const image = full.db?.image
        if (!image) return { ok: false, error: 'image facet missing' }
        const dump = await dumpOf(full.db)
        const dumpTenth = await dumpOf(tenth.db)
        const bytes = dump.ok ? jsonBytes(dump.value) : null
        const bytesTenth = dumpTenth.ok ? jsonBytes(dumpTenth.value) : null
        const sql = await attempt(() => rowsOf(image.sql(`SELECT * FROM ${quoteId(full.table)}`)).length)
        const schema = await attempt(() => image.schema().flatMap((s) => s.columns))
        const cols = schema.value ?? []
        const isDescribed = (c) => typeof c.name === 'string' && typeof c.type === 'string' && 'default' in c
        return {
                ok: dump.ok && dumpTenth.ok && sql.ok && schema.ok,
                error: dump.error ?? dumpTenth.error ?? sql.error ?? schema.error ?? null,
                dump_bytes: bytes,
                dump_bytes_tenth: bytesTenth,
                dump_ratio: bytes != null && bytesTenth ? bytes / bytesTenth : null,
                is_small: isSmall,
                dump_keys: dump.value ? Object.keys(dump.value) : null,
                sql_rows: sql.value,
                sql_limit: w,
                sql_capped: sql.ok && sql.value <= w,
                schema_ok: cols.length > 0 && cols.every(isDescribed),
                schema_columns: cols.length,
                schema_sample: cols[0] ?? null,
        }
}
