// @ts-ignore
import factory from 'wa-sqlite/dist/wa-sqlite.mjs'
import { PAGE_SIZE, VFS } from './utils/config/config.ts'
import { SETUP } from './utils/share/const.ts'
import { createSql, openDb } from './sql.ts'
import { createVfs } from './vfs.ts'

const _isWorker = () => typeof (globalThis as any).WebSocketPair === 'function'

const _compileNode = () => {
        const fs = (globalThis as any).process.getBuiltinModule('node:fs')
        return new WebAssembly.Module(fs.readFileSync(new URL(import.meta.resolve('wa-sqlite/dist/wa-sqlite.wasm'))))
}

const _compile = async (): Promise<WebAssembly.Module> => {
        if (!_isWorker()) return _compileNode()
        return (await import('wa-sqlite/dist/wa-sqlite.wasm' as string)).default
}

const _instantiate = (wasm: WebAssembly.Module) => (imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) => {
        const instance = new WebAssembly.Instance(wasm, imports)
        done(instance)
        return instance.exports
}

const _load = async () => {
        const module = await factory({ locateFile: () => 'wa-sqlite.wasm', instantiateWasm: _instantiate(await _compile()) })
        return { module, vfs: createVfs(module) }
}

let _loading: ReturnType<typeof _load> | null = null

let _seq = 0

const _registry = new FinalizationRegistry((close: () => void) => close())

const _closer = (shut: () => void, drop: (name: string) => void, name: string) => () => {
        shut()
        drop(name)
}

export const openEngine = async (bytes: Uint8Array | null) => {
        const { module: _module, vfs: _vfs } = await (_loading ??= _load())
        const _name = `image-${++_seq}.db`
        const file = _vfs.put(_name, bytes)
        const sql = createSql(_module, openDb(_module, _name, VFS))
        if (!bytes?.length) sql.query(`PRAGMA page_size = ${PAGE_SIZE}`)
        const close = _closer(sql.close, _vfs.drop, _name)
        _registry.register(sql, close)
        SETUP.forEach((text) => sql.query(text))
        return {
                sql,
                file,
                close,
        }
}
