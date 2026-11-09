// @ts-ignore
import factory from 'wa-sqlite/dist/wa-sqlite.mjs'
import { PAGE_SIZE, VFS } from './utils/config/config.ts'
import { SETUP } from './utils/const/const.ts'
import { createSql, openDb } from './sql.ts'
import { createVfs } from './vfs.ts'

const isWorker = () => typeof (globalThis as any).WebSocketPair === 'function'

const compileNode = () => {
        const fs = (globalThis as any).process.getBuiltinModule('node:fs')
        return new WebAssembly.Module(fs.readFileSync(new URL(import.meta.resolve('wa-sqlite/dist/wa-sqlite.wasm'))))
}

const compile = async (): Promise<WebAssembly.Module> => {
        if (!isWorker()) return compileNode()
        return (await import('wa-sqlite/dist/wa-sqlite.wasm' as string)).default
}

const instantiate = (wasm: WebAssembly.Module) => (imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) => {
        const instance = new WebAssembly.Instance(wasm, imports)
        done(instance)
        return instance.exports
}

const load = async () => {
        const module = await factory({ locateFile: () => 'wa-sqlite.wasm', instantiateWasm: instantiate(await compile()) })
        return { module, vfs: createVfs(module) }
}

let loading: ReturnType<typeof load> | null = null

let seq = 0

const registry = new FinalizationRegistry((close: () => void) => close())

const closer = (shut: () => void, drop: (name: string) => void, name: string) => () => {
        shut()
        drop(name)
}

export const openEngine = async (bytes: Uint8Array | null) => {
        const { module, vfs } = await (loading ??= load())
        const name = `image-${++seq}.db`
        const file = vfs.put(name, bytes)
        const sql = createSql(module, openDb(module, name, VFS))
        if (!bytes?.length) sql.query(`PRAGMA page_size = ${PAGE_SIZE}`)
        const close = closer(sql.close, vfs.drop, name)
        registry.register(sql, close)
        SETUP.forEach((text) => sql.query(text))
        return { sql, file, close }
}
