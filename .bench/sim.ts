import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as Y from 'yjs'
import { CHUNK, LIMIT, PAGE, ROOM, ROWS, SLOTS, SWAP, createDb } from '@db/server'
import { createGrid } from '@db/client'
import { createTest } from '@db/test'

const _DATA = fileURLToPath(new URL('./data/', import.meta.url))

const _WASM = new WebAssembly.Module(readFileSync(new URL('../node_modules/wa-sqlite/dist/wa-sqlite-async.wasm', import.meta.url)))

const _headOf = (file: string, bytes: number) => {
        const fd = openSync(join(_DATA, file), 'r')
        const buffer = Buffer.alloc(bytes)
        const size = readSync(fd, buffer, 0, bytes, 0)
        const text = new TextDecoder().decode(buffer.subarray(0, size))
        closeSync(fd)
        return size < bytes ? text : text.slice(0, text.lastIndexOf('\n') + 1)
}

const _opsOf = (file: string, bytes: number) =>
        new Promise<any[]>((done) => {
                const ops: any[] = []
                const send = async (op: any) => (ops.push(op), op.type === 'window' && done(ops.filter((item) => item.type === 'import')), [])
                createGrid({ doc: new Y.Doc(), id: 'csv', send } as any).dispatch({ type: 'file', name: file.split('/').pop(), text: _headOf(file, bytes) } as any)
        })

const _filesOf = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? _filesOf(join(dir, entry.name)) : entry.name.endsWith('.csv') ? [join(dir, entry.name)] : []))

export const K = { PAGE, CHUNK, ROOM, LIMIT, SWAP, SLOTS, ROWS }

export const fixtures = () =>
        Promise.all(
                _filesOf(_DATA)
                        .sort()
                        .map(async (path) => {
                                const file = relative(_DATA, path)
                                const head = _headOf(file, 65536)
                                const [first] = await _opsOf(file, 65536)
                                return { file, size: statSync(path).size, line: Math.ceil(Buffer.byteLength(head) / first.rows.length), page: first.page as string, names: first.names as string[] }
                        }),
        )

export const sim = (options: { title?: string } = {}) => {
        const nodes = new Map<string, any>()
        const docs = new Map<string, Y.Doc>()
        const bridge = (store: string, id: string) => ({
                get: (seq: number, offset?: number, length?: number) => t.serve(['get', store, id, seq, offset, length]),
                put: (seq: number, bytes: Uint8Array, tag: string) => t.serve(['put', store, id, seq, bytes, tag]),
                delete: (seqs: number[]) => t.serve(['delete', store, id, seqs]),
        })
        const HOST: Record<string, (...args: any[]) => any> = {
                const: () => K,
                boot: (id, store) => void nodes.set(id, createDb({ wasm: _WASM, store: bridge(store, id), doc: docs.set(id, new Y.Doc()).get(id)! } as any)),
                kill: (id) => void (nodes.delete(id), docs.delete(id)),
                run: (id, op) => nodes.get(id).run(op),
                execute: (id, codes) => nodes.get(id).execute(codes),
                compile: (id, op) => nodes.get(id).compile(op, nodes.get(id).stat()),
                stat: (id) => nodes.get(id).stat(),
                view: (id) => [...docs.get(id)!.getMap('view').entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
                csv: (file, bytes) => _opsOf(file, bytes),
        }
        const t = createTest({ ...options, send: async ([kind, ...args]) => HOST[kind](...args) })
        return t
}
