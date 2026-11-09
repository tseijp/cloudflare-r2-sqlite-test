import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { listFiles } from './hash.mjs'

export const ENTRY = 'src/server/db/index.ts'

export const FACETS = {
        image: ['sql', 'declare', 'window', 'edit', 'frames', 'checkpoint', 'bytes', 'orphans', 'schema'],
        replica: ['push', 'sync', 'compact', 'snapshot', 'restore', 'index', 'tick'],
        window: ['move', 'act', 'dump', 'undo', 'redo'],
}

const SUFFIXES = ['.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx', '/index.mjs', '/index.js']

const isRelative = (s) => s.startsWith('./') || s.startsWith('../')

const hasExt = (s) => /\.(m?[jt]sx?|json|wasm)$/.test(s)

let isHooked = false

const hook = () => {
        if (isHooked) return
        isHooked = true
        registerHooks({
                resolve: (specifier, context, next) => {
                        const isCandidate =
                                isRelative(specifier) && !hasExt(specifier) && context.parentURL?.startsWith('file:')
                        if (!isCandidate) return next(specifier, context)
                        const base = fileURLToPath(new URL(specifier, context.parentURL))
                        const hit = SUFFIXES.find((s) => existsSync(base + s))
                        return next(hit ? specifier + hit : specifier, context)
                },
        })
}

const messageOf = (error) => String(error?.message ?? error)

export const attempt = (fn) =>
        new Promise((resolve) => resolve(fn())).then(
                (value) => ({ ok: true, value, error: null }),
                (error) => ({ ok: false, value: null, error: messageOf(error) }),
        )

export const loadProduct = async (root) => {
        hook()
        const file = join(root, ENTRY)
        const none = { ok: false, open: null, entry: ENTRY }
        if (!existsSync(file)) return { ...none, error: 'file missing' }
        const loaded = await attempt(() => import(pathToFileURL(file).href))
        if (!loaded.ok) return { ...none, error: loaded.error }
        const openDb = loaded.value.openDb
        if (typeof openDb !== 'function') return { ...none, error: 'export openDb missing' }
        return { ok: true, error: null, entry: ENTRY, open: (input) => attempt(() => openDb(input)) }
}

const missingOf = (facet, names) => (facet ? names.filter((n) => !(n in facet)) : names)

export const probeProduct = async (product, input) => {
        const opened = product.ok ? await product.open(input) : product
        const db = opened.value ?? {}
        const facets = Object.fromEntries(Object.keys(FACETS).map((k) => [k, Boolean(db[k])]))
        const methods = Object.fromEntries(Object.entries(FACETS).map(([k, names]) => [k, missingOf(db[k], names)]))
        const size = Number(db.image?.pageSize)
        const isSized = Number.isFinite(size) && size > 0
        const pageSize = { page_size: isSized ? size : 4096, page_size_source: isSized ? 'product' : 'default' }
        return { facets, methods, ...pageSize, error: opened.error }
}

export const isRunnerReferenced = (root) => {
        const pattern = /\.bench\/|run\.mjs/
        return listFiles(join(root, 'src')).filter((f) => pattern.test(readFileSync(f, 'utf8')))
}

const objectOf = (cols, row) => Object.fromEntries(cols.map((c, i) => [c, row[i]]).filter(([, v]) => v !== null && v !== undefined))

export const rowsOf = (res) => {
        const rows = Array.isArray(res?.rows) ? res.rows : []
        if (!Array.isArray(res?.cols)) return rows
        return rows.map((row) => (Array.isArray(row) ? objectOf(res.cols, row) : row))
}

export const txidOf = (frames, fallback = 0) => frames.reduce((m, f) => Math.max(m, Number(f.txid) || 0), fallback)

export const jsonBytes = (value) => Buffer.byteLength(JSON.stringify(value ?? null))
