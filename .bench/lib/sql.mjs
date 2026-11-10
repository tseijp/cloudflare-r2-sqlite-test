export const quote = (name) => '"' + String(name).replaceAll('"', '""') + '"'

export const cellOf = (res, r = 0, c = 0) => {
        const row = res?.rows?.[r]
        if (row === undefined || row === null) return undefined
        if (Array.isArray(row)) return row[c]
        const key = res.cols?.[c] ?? Object.keys(row)[c]
        return row[key]
}

export const valueOf = async (db, text, params) => cellOf(await db.sql(text, params))

export const rowsOf = (res) => {
        const rows = res?.rows ?? []
        return rows.map((row) => (Array.isArray(row) ? row : (res.cols ?? Object.keys(row)).map((k) => row[k])))
}

export const settle = () => new Promise((resolve) => setImmediate(resolve))

export const framesOf = async (db, op) => {
        await db.sql('PRAGMA wal_checkpoint(TRUNCATE)')
        await op()
        await settle()
        const res = await db.sql('PRAGMA wal_checkpoint(PASSIVE)')
        return Number(cellOf(res, 0, 1))
}

export const guard = (fn) =>
        Promise.resolve()
                .then(fn)
                .then(
                        (value) => ({ value }),
                        (error) => ({ error: String(error?.message ?? error).slice(0, 300) }),
                )

export const physicalOf = async (db, page) => {
        const res = await db.sql('SELECT name FROM pragma_table_info(?)', [page])
        return rowsOf(res).map((r) => r[0])
}

export const countOf = async (db, page) => Number(await valueOf(db, `SELECT count(*) FROM ${quote(page)}`))
