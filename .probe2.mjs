import { existsSync, readFileSync, statSync } from 'node:fs'
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
const file = process.argv[2]
const text = readFileSync(file, 'utf8').replace(/^﻿/, '')
const rows = text.split(/\r?\n/).filter(Boolean).map((l) => l.split(','))
const objects = new Map(); const stat = { put: 0, get: 0, getBytes: 0, putBytes: 0, list: 0, del: 0 }
const storage = {
  put: async (k, b, o) => { if (o?.ifNoneMatch && objects.has(k)) return null; stat.put++; stat.putBytes += b.length; objects.set(k, b.slice()); return { etag: k } },
  get: async (k, r) => { const b = objects.get(k); if (!b) return null; stat.get++; const out = !r ? b : 'suffix' in r ? b.subarray(Math.max(0, b.length - r.suffix)) : b.subarray(r.offset, r.offset + r.length); stat.getBytes += out.length; return out.slice() },
  list: async (p) => { stat.list++; return [...objects].filter(([k]) => k.startsWith(p)).map(([key, b]) => ({ key, size: b.length })) },
  delete: async (ks) => { stat.del++; ks.forEach((k) => objects.delete(k)) },
}
const t = (label, t0) => console.log(label, Math.round(performance.now() - t0), 'ms')
let t0 = performance.now()
const db = await openDb({ storage, doc: new Y.Doc(), prefix: 'p/' })
t('open', t0); t0 = performance.now()
await db.load([{ name: 'sp', rows }])
t('load ' + rows.length, t0); t0 = performance.now()
const bytes = await db.bytes()
console.log('rho', (bytes.length / statSync(file).size).toFixed(3), bytes.length)
t0 = performance.now(); await db.move({ page: 'sp', from: 300000, to: 300049 }); t('move', t0)
t0 = performance.now(); await db.act({ kind: 'cells', page: 'sp', cells: [{ row: 300001, col: 'close', value: '1.5' }] }); t('cell', t0)
t0 = performance.now(); console.log(JSON.stringify(await db.sql('SELECT Name, count(*), avg(close) FROM sp GROUP BY Name ORDER BY 2 DESC LIMIT 3'))); t('groupby', t0)
t0 = performance.now(); console.log(JSON.stringify(await db.save())); t('save full', t0)
await db.act({ kind: 'cells', page: 'sp', cells: [{ row: 300002, col: 'close', value: '2.5' }] })
t0 = performance.now(); console.log(JSON.stringify(await db.save())); t('save diff', t0)
console.log('dump bytes', JSON.stringify(db.dump()).length)
Object.assign(stat, { put: 0, get: 0, getBytes: 0, putBytes: 0, list: 0, del: 0 })
t0 = performance.now(); const db2 = await openDb({ storage, doc: new Y.Doc(), prefix: 'p/' }); t('reopen', t0)
console.log('reopen stat', JSON.stringify(stat))
t0 = performance.now(); await db2.move({ page: 'sp', from: 300000, to: 300049 }); t('lazy move', t0)
console.log('move stat', JSON.stringify(stat), JSON.stringify(db2.dump()['row/300002']))
console.log('rss MB', Math.round(process.memoryUsage().rss / 1e6))
