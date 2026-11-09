import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { col, mark, style } from './schema'
import { parseOp, parseSheet } from '../procedural/parse/index'
import { applyOp, dropTombs, ensureTable, loadSheet, readLayout, readSchema, readWindow } from '../procedural/plan/index'
import type { Engine } from './engine'
import type { Ctx, Op, Page, Q, Req, Sheet, Value } from '../procedural/share/types'

const _TABLES = { col, style, mark }

export const createTable = async (engine: Engine, config: { sample: number; chunk: number }) => {
        let _pages: Page[] = []
        const _ctx = (q: Q): Ctx => ({
                // @ts-ignore
                db: drizzle((text, params, method) => q(text, params).then((r) => ({ rows: method === 'get' ? r.rows[0] : r.rows, changes: r.changes }) as any)),
                tables: _TABLES,
                pages: _pages,
        })
        const _sync = async (ctx: Ctx) => void (ctx.pages = _pages = await readLayout(ctx.db))
        const _write = <T>(fn: (ctx: Ctx) => Promise<T>) => {
                const before = _pages
                return engine
                        .run((q) => fn(_ctx(q)), true)
                        .catch((error) => {
                                _pages = before
                                return Promise.reject(error)
                        })
        }
        const _read = <T>(fn: (ctx: Ctx) => Promise<T>) => engine.run((q) => fn(_ctx(q)))
        await _write(async (ctx) => {
                for (const table of Object.values(_TABLES)) await ensureTable(ctx.db, table)
                await _sync(ctx)
        })
        return {
                pages() {
                        return _pages
                },
                apply(ops: Op[]) {
                        return _write(async (ctx) => {
                                let undo: Op[] = []
                                let id: Value | undefined
                                for (const op of ops) {
                                        const parsed = parseOp(op, ctx.pages)
                                        if (!parsed) return Promise.reject(new Error(`invalid op: ${op.kind}`))
                                        const done = await applyOp(ctx, parsed)
                                        undo = [...done.undo, ...undo]
                                        id = done.id ?? id
                                        if (done.isLayout) await _sync(ctx)
                                }
                                return { undo, id }
                        })
                },
                load(sheets: Sheet[]) {
                        return _write(async (ctx) => {
                                const names: string[] = []
                                for (const sheet of sheets) {
                                        names.push(await loadSheet(ctx, parseSheet(sheet, ctx.pages, config.sample), config.chunk))
                                        await _sync(ctx)
                                }
                                return names
                        })
                },
                window(req: Req) {
                        return _read((ctx) => readWindow(ctx, req))
                },
                schema() {
                        return _read(readSchema)
                },
                drop() {
                        return _write(async (ctx) => dropTombs(ctx.db))
                },
                async sql(text: string, params: Value[] | undefined, limit: number) {
                        const result = await engine.run((q) => q(text, params, limit))
                        await _read(_sync)
                        return result
                },
        }
}

export type Table = Awaited<ReturnType<typeof createTable>>
