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
    const code = esbuild.transformSync(readFileSync(fileURLToPath(url), 'utf8'), { loader: 'tsx', jsx: 'automatic', format: 'esm' }).code
    return { format: 'module', source: code, shortCircuit: true }
  },
})
const Y = await import('yjs')
const React = await import('react')
const { renderToString } = await import('react-dom/server')
const { openDb } = await import('./src/server/db/index.ts')
const { createGrid } = await import('./src/client/db/index.tsx')
const { createStore } = await import('./src/client/db/declarative/store.ts')
const { createGesture } = await import('./src/client/db/declarative/gesture.ts')
const server = new Y.Doc(); const client = new Y.Doc()
server.on('update', (u) => Y.applyUpdate(client, u))
const db = await openDb({ doc: server })
const send = { act: (op) => db.act(op), move: (r) => db.move(r), undo: () => db.undo(), redo: () => db.redo(), load: (s) => db.load(s) }
const store = createStore(client); const g = createGesture(store, send)
await g.bar.addPage(); console.log('pages', store.pages().map((p) => p.name), 'win', JSON.stringify(store.win()))
await g.bar.addCol(); await g.bar.addCol(); await g.bar.addRow(); await g.bar.addRow()
console.log('fields', store.fields().map((f) => f.name), 'lines', JSON.stringify(store.lines()))
store.set({ sel: { row: 1, col: 0, row2: 1, col2: 0 } })
const ev = (key, extra = {}) => ({ key, shiftKey: false, metaKey: false, ctrlKey: false, preventDefault() {}, ...extra })
g.onKeyDown(ev('a')); console.log('edit', JSON.stringify(store.ui().edit))
await g.editor.onKeyDown(ev('Enter', { nativeEvent: { isComposing: false }, currentTarget: { value: 'こんにちは' } }))
await new Promise((r) => setTimeout(r, 20))
console.log('after commit', JSON.stringify(store.lines()), 'sel', JSON.stringify(store.ui().sel))
store.set({ sel: { row: 1, col: 0, row2: 2, col2: 1 } }); g.onKeyDown(ev('Delete')); await new Promise((r) => setTimeout(r, 20))
console.log('after clear', JSON.stringify(store.lines()))
g.onKeyDown(ev('z', { ctrlKey: true })); await new Promise((r) => setTimeout(r, 20)); console.log('after undo', JSON.stringify(store.lines()))
store.set({ edit: { row: 0, col: 1, seed: '列2' } }); await g.editor.onKeyDown(ev('Enter', { nativeEvent: { isComposing: false }, currentTarget: { value: '金額' } })); await new Promise((r) => setTimeout(r, 20))
console.log('renamed', store.fields().map((f) => f.name))
await g.sort(1); await new Promise((r) => setTimeout(r, 20)); console.log('sorted', JSON.stringify(store.win().order))
store.set({ sel: { row: 1, col: 0, row2: 1, col2: 0 } }); await g.bar.fill(); await g.bar.bold(); await new Promise((r) => setTimeout(r, 20))
console.log('deco', JSON.stringify(store.lines()[0].deco))
await g.bar.bold(); await g.bar.fill(); await new Promise((r) => setTimeout(r, 20)); console.log('undeco', JSON.stringify(store.lines()[0].deco))
await g.bar.open('シート1'); for (let i = 0; i < 60; i++) await db.act({ kind: 'row.add', page: 'シート1' })
await g.bar.addRow(); await new Promise((r) => setTimeout(r, 20)); console.log('added', JSON.stringify(store.ui().sel), JSON.stringify(store.win()).slice(0, 80))
const { Grid } = createGrid(client, send)
const html = renderToString(React.createElement(Grid)); console.log('html', html.length, html.includes('こんにちは'), html.includes('金額'))
console.log('dump', JSON.stringify(db.dump()).slice(0, 300))
