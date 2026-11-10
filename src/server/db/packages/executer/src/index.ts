import { createPager } from '@db/server-executer-page'
import { createSqlite } from '@db/server-executer-sqlite'
import { createStorage } from '@db/server-executer-store'
import { createTree } from '@db/server-executer-tree'
import type { Code, Input, Stat } from '@db/server-share'

export const createExecuter = ({ wasm, store, doc }: Input) => {
        const _storage = createStorage(store)
        const _pager = createPager(_storage.chunk)
        const _sqlite = createSqlite(wasm, _pager.vfs)
        const _tree = createTree(doc)
        const _view = async (name: string, text: string, params: any[]) => _tree.view(name, await _sqlite.all(text, params))
        const _CODES: Record<string, (...args: any[]) => any> = {
                pull: async () => _pager.reset(await _storage.head(), _storage.stat().base, await _storage.chain()),
                open: () => _sqlite.open(),
                sql: (text, params) => _sqlite.all(text, params),
                read: (text, limit) => _sqlite.read(text, limit),
                view: async (name, text, params, tags) => {
                        await _view(name, text, params)
                        _tree.keep(name, text, params, tags)
                },
                refresh: async () => {
                        for (const [name, text, params] of _tree.kept()) await _view(name, text, params)
                },
                drop: (tag) => _tree.drop(tag),
                fill: async (key, text, params) => _tree.fill(key, JSON.stringify(await _sqlite.all(text, params))),
                set: (key, value, origin) => _tree.set(key, value, origin),
                undo: (origin) => _tree.undo(origin),
                redo: (origin) => _tree.redo(origin),
                forget: () => _tree.forget(),
                push: async () => {
                        await _storage.push(_pager.stat().pages, _pager.dirty())
                        _pager.clean()
                },
                merge: async () => {
                        await _storage.merge(_pager.stat().pages, _pager.compose)
                        _pager.rebase()
                },
        }
        const _each = async (codes: Code[]) => {
                let out: any
                for (const [code, ...args] of codes) out = (await _CODES[code](...args)) ?? out
                return out
        }
        return {
                run: (codes: Code[]) => _each(codes).finally(_sqlite.settle),
                stat: (): Stat => ({ ..._pager.stat(), ..._storage.stat() }),
                echo: () => _tree.echo(),
        }
}
