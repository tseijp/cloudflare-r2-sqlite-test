import { existsSync, readFileSync } from 'node:fs'
import { registerHooks, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const esbuild = createRequire(import.meta.url)('./node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild')
registerHooks({
  resolve: (s, c, next) => {
    const isRel = (s.startsWith('./') || s.startsWith('../')) && !/\.(m?[jt]sx?|json|wasm)$/.test(s) && c.parentURL?.startsWith('file:')
    if (!isRel) return next(s, c)
    const base = fileURLToPath(new URL(s, c.parentURL))
    const hit = ['.ts', '.tsx', '/index.ts', '/index.tsx'].find((x) => existsSync(base + x))
    return next(hit ? s + hit : s, c)
  },
  load: (url, c, next) => {
    if (!url.endsWith('.tsx')) return next(url, c)
    return { format: 'module', source: esbuild.transformSync(readFileSync(fileURLToPath(url), 'utf8'), { loader: 'tsx', jsx: 'automatic', format: 'esm' }).code, shortCircuit: true }
  },
})
const Y = await import('yjs')
const { openDb } = await import('./src/server/db/index.ts')
const { createStore } = await import('./src/client/db/declarative/store.ts')
const { createGesture } = await import('./src/client/db/declarative/gesture.ts')
const { createQueue } = await import('./src/client/db/declarative/queue.ts')
const server = new Y.Doc(); const a = new Y.Doc(); const b = new Y.Doc()
server.on('update', (u, origin) => { if (origin !== 'a') Y.applyUpdate(a, u, 'server'); if (origin !== 'b') Y.applyUpdate(b, u, 'server') })
const db = await openDb({ doc: server })
await db.load([{ name: 'p', rows: [['n'], ...Array.from({ length: 300 }, (_, i) => [String(i)])] }])
const send = { act: (op) => db.act(op), move: (r) => db.move(r), undo: () => db.undo(), redo: () => db.redo(), load: (s) => db.load(s) }
const sa = createStore(a, 'A'); const ga = createGesture(sa, createQueue(send, 'A'))
const sb = createStore(b, 'B'); const gb = createGesture(sb, createQueue(send, 'B'))
console.log('initial', sa.win()?.from, sb.win()?.from, Object.keys(db.dump()).filter((k) => k.startsWith('win/')))
await gb.bar.open('p'); await db.move({ page: 'p', from: 200, to: 249, view: 'B' })
console.log('a', sa.win().from, sa.lines().length, 'b', sb.win().from, sb.lines().length, 'rows', Object.keys(db.dump()).filter((k) => k.startsWith('row/')).length)
await db.act({ kind: 'cells', page: 'p', cells: [{ row: 210, col: 'n', value: 'B編集' }] })
console.log('b sees', JSON.stringify(sb.lines().find((l) => l.id === 210).values), 'rev', db.dump().rev)
const stale = new Y.Doc(); Y.applyUpdate(stale, Y.encodeStateAsUpdate(server)); stale.getMap('grid').set('row/999', Y.Array.from(['stale']))
Y.applyUpdate(server, Y.encodeStateAsUpdate(stale), { conn: 1 })
await new Promise((r) => setTimeout(r, 30))
console.log('healed', db.dump()['row/999'] === undefined)
await db.act({ kind: 'cells', page: 'p', cells: [{ row: 290, col: 'n', value: 'outside' }] })
const before = JSON.stringify(db.dump().rev); await db.undo(); console.log('undo outside window bumps rev', before !== JSON.stringify(db.dump().rev))
for (let i = 0; i < 12; i++) await db.move({ page: 'p', from: 1, to: 50, view: 'v' + i })
console.log('views capped', Object.keys(db.dump()).filter((k) => k.startsWith('win/')).length)
