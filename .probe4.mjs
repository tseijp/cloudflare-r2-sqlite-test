import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
registerHooks({ resolve: (s, c, next) => {
  const isRel = (s.startsWith('./') || s.startsWith('../')) && !/\.(m?[jt]sx?|json|wasm)$/.test(s) && c.parentURL?.startsWith('file:')
  if (!isRel) return next(s, c)
  const base = fileURLToPath(new URL(s, c.parentURL))
  const hit = ['.ts', '.tsx', '/index.ts', '/index.tsx'].find((x) => existsSync(base + x))
  return next(hit ? s + hit : s, c)
} })
const Y = await import('yjs')
const { openDb } = await import('./src/server/db/index.ts')
const objects = new Map(); let fail = false
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const storage = {
  put: async (k, b, o) => { await sleep(50); if (fail) return Promise.reject(new Error('r2 down')); if (o?.ifNoneMatch && objects.has(k)) return null; objects.set(k, b.slice()); return { etag: k } },
  get: async (k, r) => { const b = objects.get(k); if (!b) return null; const out = !r ? b : 'suffix' in r ? b.subarray(Math.max(0, b.length - r.suffix)) : b.subarray(r.offset, r.offset + r.length); return out.slice() },
  list: async (p) => [...objects].filter(([k]) => k.startsWith(p)).map(([key, b]) => ({ key, size: b.length })),
  delete: async (ks) => ks.forEach((k) => objects.delete(k)),
}
const db = await openDb({ storage, prefix: 'r/' })
await db.load([{ name: 'p', rows: [['a', 'b'], ...Array.from({ length: 3000 }, (_, i) => [String(i), 'x' + i])] }])
await db.save()
await db.act({ kind: 'cells', page: 'p', cells: [{ row: 1, col: 'b', value: 'one' }] })
const s1 = db.save()
await db.act({ kind: 'cells', page: 'p', cells: [{ row: 2, col: 'b', value: 'two' }] })
const s2 = db.save()
console.log('concurrent', JSON.stringify(await s1), JSON.stringify(await s2))
fail = true
await db.act({ kind: 'cells', page: 'p', cells: [{ row: 3, col: 'b', value: 'three' }] })
console.log('failed put', await db.save().then(() => 'ok', (e) => e.message))
fail = false
console.log('after failure', JSON.stringify(await db.save()))
const db2 = await openDb({ storage, prefix: 'r/' })
console.log('reopen', JSON.stringify((await db2.sql('SELECT b FROM p WHERE _id <= 3')).rows))
await db.act({ kind: 'col.remove', page: 'p', name: 'b' })
await db.load([{ name: 'big', rows: [['x'], ...Array.from({ length: 20000 }, (_, i) => [String(i)])] }])
console.log('rollup', JSON.stringify(await db.save()))
console.log('undo after drop', await db.undo().then(() => 'ok', (e) => e.message), JSON.stringify((await db.sql("SELECT name FROM pragma_table_info('p')")).rows))
storage.list = async () => [['r/000000000001.full', 1], ['r/x/000000000009.full', 1]].map(([key, size]) => ({ key, size }))
console.log('nested prefix ignored', JSON.stringify((await import('./src/server/db/procedural/ship/index.ts')).parseKey('r/', 'r/x/000000000009.full', 1)))
