import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs'
import * as SQLite from 'wa-sqlite'

const _READS = [SQLite.SQLITE_SELECT, SQLite.SQLITE_READ, SQLite.SQLITE_FUNCTION, SQLite.SQLITE_RECURSIVE]

export const createSqlite = (wasm: WebAssembly.Module, vfs: any) => {
        let _api: any = null
        let _db = 0
        const _boot = async () => {
                const instantiateWasm = (imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => WebAssembly.Exports) => done(new WebAssembly.Instance(wasm, imports))
                _api = SQLite.Factory(await SQLiteESMFactory({ instantiateWasm }))
                _api.vfs_register(vfs, true)
        }
        const _query = async (text: string, params: any[], limit: number) => {
                const found = { names: [] as string[], rows: [] as any[][] }
                for await (const stmt of _api.statements(_db, text)) {
                        _api.bind_collection(stmt, params)
                        found.names = _api.column_names(stmt)
                        found.rows = []
                        while (found.rows.length < limit && (await _api.step(stmt)) === SQLite.SQLITE_ROW) found.rows.push(_api.row(stmt))
                }
                return found
        }
        const all = async (text: string, params: any[] = []) => (await _query(text, params, Infinity)).rows
        return {
                all,
                async open() {
                        if (!_api) await _boot()
                        if (_db) await _api.close(_db)
                        _db = await _api.open_v2('db')
                },
                read(text: string, limit: number) {
                        _api.set_authorizer(_db, (_: any, code: number) => (_READS.includes(code) ? SQLite.SQLITE_OK : SQLite.SQLITE_DENY), null)
                        return _query(text, [], limit)
                                .then(({ names, rows }) => [names, ...rows])
                                .finally(() => _api.set_authorizer(_db, null, null))
                },
                async settle() {
                        if (_db && !_api.get_autocommit(_db)) await all('rollback')
                },
        }
}
