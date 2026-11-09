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
const objects = new Map(); const stat = { put: 0, get: 0, getBytes: 0, putBytes: 0, list: 0, del: 0 }
const storage = {
  put: async (k, b, o) => { if (o?.ifNoneMatch && objects.has(k)) return null; stat.put++; stat.putBytes += b.length; objects.set(k, b.slice()); return { etag: k } },
  get: async (k, r) => { const b = objects.get(k); if (!b) return null; stat.get++; const out = !r ? b : 'suffix' in r ? b.subarray(Math.max(0, b.length - r.suffix)) : b.subarray(r.offset, r.offset + r.length); stat.getBytes += out.length; return out.slice() },
  list: async (p) => { stat.list++; return [...objects].filter(([k]) => k.startsWith(p)).map(([key, b]) => ({ key, size: b.length })) },
  delete: async (ks) => { stat.del++; ks.forEach((k) => objects.delete(k)) },
}
const frames = async (db, fn) => { await db.sql('PRAGMA wal_checkpoint(TRUNCATE)'); await fn(); const r = await db.sql('PRAGMA wal_checkpoint(PASSIVE)'); return r.rows[0][1] }
const doc = new Y.Doc()
const db = await openDb({ storage, doc, prefix: 'room/' })
const rows = [['会社名', '金額', '日付'], ...Array.from({ length: 5000 }, (_, i) => [`株式会社${i}`, String(i * 10), `2025/1/${(i % 28) + 1}`])]
console.log('load', await db.load([{ name: 'recorder', rows }]))
console.log('schema', JSON.stringify(await db.schema()))
const d = db.dump(); console.log('keys', Object.keys(d).length, JSON.stringify(d['page/recorder']), JSON.stringify(d['win/main']).slice(0, 120), JSON.stringify(d['row/3']))
console.log('cell frames', await frames(db, () => db.act({ kind: 'cells', page: 'recorder', cells: [{ row: 3, col: '金額', value: '999' }] })))
console.log('same frames', await frames(db, () => db.act({ kind: 'cells', page: 'recorder', cells: [{ row: 3, col: '金額', value: '999' }] })))
console.log('row3', JSON.stringify(db.dump()['row/3']))
console.log('batch50 frames', await frames(db, () => db.act({ kind: 'cells', page: 'recorder', cells: Array.from({ length: 50 }, (_, i) => ({ row: 100 + i, col: '会社名', value: 'x' + i })) })))
console.log('row.add frames', await frames(db, () => db.act({ kind: 'row.add', page: 'recorder', values: { 会社名: '新規' } })))
console.log('col.add frames', await frames(db, () => db.act({ kind: 'col.add', page: 'recorder', name: '確度', type: 'number' })))
console.log('col.rename frames', await frames(db, () => db.act({ kind: 'col.set', page: 'recorder', name: '確度', to: '確率' })))
console.log('width frames', await frames(db, () => db.act({ kind: 'col.set', page: 'recorder', name: '確率', width: 5 })))
await db.act({ kind: 'style', page: 'recorder', cells: [{ row: 3, col: '会社名', json: '{"fill":"#ff0"}' }] })
await db.act({ kind: 'cells', page: 'recorder', cells: [{ row: 3, col: '会社名', value: '株式会社さん', marks: [{ from: 0, to: 4, attr: 'bold', val: '1' }] }] })
console.log('deco', JSON.stringify(db.dump()['deco/3']))
await db.act({ kind: 'cells', page: 'recorder', cells: [{ row: 3, col: '会社名', value: '' }] })
console.log('after clear deco', JSON.stringify(db.dump()['deco/3']), JSON.stringify(db.dump()['row/3']))
await db.undo(); console.log('undo', JSON.stringify(db.dump()['row/3']), JSON.stringify(db.dump()['deco/3']))
await db.redo(); console.log('redo', JSON.stringify(db.dump()['row/3']))
console.log('row.remove frames', await frames(db, () => db.act({ kind: 'row.remove', page: 'recorder', rows: [3] })))
await db.undo(); console.log('undo remove', JSON.stringify(db.dump()['row/3']), JSON.stringify(db.dump()['deco/3']))
console.log('col.remove frames', await frames(db, () => db.act({ kind: 'col.remove', page: 'recorder', name: '日付' })))
console.log('cols', JSON.stringify(db.dump()['page/recorder'].cols.map((c) => c.name)))
await db.undo(); console.log('undo col', JSON.stringify(db.dump()['page/recorder'].cols.map((c) => c.name)), JSON.stringify(db.dump()['row/3']))
await db.move({ page: 'recorder', from: 1000, to: 1049 }); console.log('moved', JSON.stringify(db.dump()['win/main']).slice(0, 80), Object.keys(db.dump()).filter((k) => k.startsWith('row/')).length)
await db.move({ page: 'recorder', from: 1, to: 50, order: { col: '金額', dir: 'desc' } }); console.log('sorted', JSON.stringify(db.dump()['win/main'].ids.slice(0, 5)))
console.log('sql', JSON.stringify(await db.sql('SELECT count(*), sum("金額") FROM recorder')))
console.log('save1', JSON.stringify(await db.save()), JSON.stringify(stat))
await db.act({ kind: 'cells', page: 'recorder', cells: [{ row: 10, col: '金額', value: '12345' }] })
console.log('save2', JSON.stringify(await db.save()), JSON.stringify(stat))
const before = await db.bytes()
Object.assign(stat, { put: 0, get: 0, getBytes: 0, putBytes: 0, list: 0, del: 0 })
const db2 = await openDb({ storage, doc: new Y.Doc(), prefix: 'room/' })
console.log('reopen', JSON.stringify(stat), JSON.stringify(db2.dump()['row/10']), 'image', before.length)
const after = await db2.bytes()
console.log('restore equal', before.length === after.length && before.every((v, i) => v === after[i]), JSON.stringify(stat))
console.log('integrity', JSON.stringify(await db2.sql('PRAGMA integrity_check')))
