import * as Y from 'yjs'
import { createModel } from './model.mjs'
import { createStore } from './store.mjs'
import { decodeStore, decodeDelta, CHUNK } from './codec.mjs'
import { createJudge } from './judge.mjs'

export const hooks = { crash: null }
const _eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const _race = (promise, ms, drop) => new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ ok: false, error: 'timeout', hang: true }), ms)
        const settle = (r) => (clearTimeout(timer), resolve(r))
        hooks.crash = (e) => settle({ ok: false, error: `crash: ${e?.message ?? e}`, hang: true })
        drop.fire = () => settle({ ok: false, error: 'dropped', dropped: true })
        promise.then((value) => settle({ ok: true, value }), (error) => settle({ ok: false, error: String(error?.message ?? error) }))
})

export const replay = async (script, env) => {
        const store = createStore()
        const model = createModel()
        const judge = createJudge({ store, model })
        const state = { snap: model.snapshot(), touched: false, failedPut: null, diverged: false, prelude: false, clean: true, tag: '' }
        const drop = { fire: null }
        let inst = null
        let index = -1
        let aborted = null
        const peaks = { afterOpen: 0, beforeSave: 0 }
        const fresh = () => {
                if (inst) inst.facade.life.dead = true
                const facade = store.facade()
                const doc = new Y.Doc()
                inst = { facade, doc, db: env.createDb({ wasm: env.wasm, store: facade, doc }) }
                judge.use({ db: inst.db, doc, run: (op) => (inst.dead ? Promise.resolve({ ok: false, error: inst.dead, hang: true }) : _race(inst.db.run(op), env.timeout, drop).then((r) => ((inst.dead = r.hang ? r.error : inst.dead), r))) })
                Object.assign(state, { touched: false, failedPut: null, diverged: false, prelude: false })
        }
        const saved = (list, res) => {
                const put = list.find((c) => c.kind === 'put')
                if (put?.wrote) Object.assign(state, { snap: model.snapshot(), touched: false })
                state.failedPut = put?.fault === 'reject' || put?.fault === 'after' ? put.args[0] : null
                if (put?.fault === 'after') state.diverged = true
                if (put?.fault === 'after' || put?.fault === 'null') state.prelude = true
                state.clean = res.ok && !list.some((c) => c.fault) && !!put?.wrote
        }
        const expectOf = (op, res, faulted) => {
                if (op.type === 'open') return (model.restore(state.snap), { status: 'ok', changed: false })
                if (op.type === 'import' && !res.ok && /full/i.test(res.error)) return { status: 'full', changed: false }
                if (faulted && !res.ok && op.type !== 'save') return { status: 'faulted', changed: false }
                return model.apply(op)
        }
        const exec = async (op, faults = [], override = null) => {
                const from = store.begin(index, faults, 'main', () => drop.fire?.())
                const before = inst.db.stat()
                const dBefore = decodeStore(store.objects)
                const payload = op.type === 'import' && Array.isArray(op.rows) ? model.payload() + op.rows.reduce((n, r) => n + 8 + (Array.isArray(r) ? r.reduce((b, t) => b + (typeof t === 'string' ? Buffer.byteLength(t) : 0), 0) : 0), 0) : undefined
                const prior = { ...state }
                const res = await _race(inst.db.run(op), env.timeout, drop)
                const list = store.log.slice(from, store.begin(index)).filter((c) => c.origin === 'main')
                const faulted = list.some((c) => c.fault)
                const after = res.hang ? before : inst.db.stat()
                const expect = override ?? (op.type === 'save' && prior.diverged ? { status: 'reject', changed: false } : expectOf(op, res, faulted))
                await judge.step({ op, expect, res, calls: list, before, after, state: prior, dBefore, dAfter: decodeStore(store.objects), payload })
                if (expect.changed) state.touched = true
                if (faulted || res.dropped) state.clean = false
                if (op.type === 'save') saved(list, res)
                if (op.type === 'open' && res.ok) Object.assign(state, { failedPut: null, diverged: false, prelude: false, touched: false })
                if ((op.type === 'open' || op.type === 'save') && res.ok) state.tag = store.objects.get(0)?.tag ?? ''
                if (op.type === 'open' && res.ok) peaks.afterOpen = Math.max(peaks.afterOpen, after.deltas)
                if (op.type === 'save') peaks.beforeSave = Math.max(peaks.beforeSave, before.deltas)
                env.trace?.({ index, op, expect, res, model, state })
                if (res.hang || inst.dead) aborted ??= { index, error: res.hang ? res.error : inst.dead }
                return res
        }
        const boot = async (faults, axis, depth = 0) => {
                fresh()
                const res = await exec({ type: 'open' }, faults)
                if (res.hang || (!res.ok && depth > 0)) return
                if (!res.ok) return boot([], axis, depth + 1)
                await judge.reopen(env.oracle, axis)
                await judge.full(axis, axis)
                state.clean = true
        }
        const stale = () => {
                const d = decodeStore(store.objects)
                const seq = d.deltas + 1
                const old = store.log.find((c) => c.kind === 'put' && c.bytes && decodeDelta(c.bytes).tag !== store.objects.get(seq - 1)?.tag)
                if (d.base <= CHUNK || !old || store.objects.has(seq)) return
                store.raw.put(seq, old.bytes, '')
                state.clean = false
        }
        const rival = async (first) => {
                const facade = store.facade()
                const b = env.createDb({ wasm: env.wasm, store: facade, doc: new Y.Doc() })
                const bm = createModel()
                const runB = (op) => (store.begin(index, [], 'rival'), _race(b.run(op), env.timeout, drop))
                await runB({ type: 'open' })
                bm.restore(state.snap)
                await runB({ type: 'page.add', page: `rival${index}` })
                bm.apply({ type: 'page.add', page: `rival${index}` })
                const a = first === 'A' ? await (await exec({ type: 'page.add', page: `main${index}` }), exec({ type: 'save' })) : null
                const sb = await runB({ type: 'save' })
                const tags = store.tagsOf()
                if (first === 'B' && sb.ok) state.snap = bm.snapshot()
                const a2 = first === 'B' ? await (await exec({ type: 'page.add', page: `main${index}` }), exec({ type: 'save' }, [], { status: 'reject', changed: false })) : null
                const [winner, loser] = first === 'A' ? [a, sb] : [sb, a2]
                judge.record('単一書き', 'later save rejects', winner.ok && !loser.ok, `${first} resolves, the other rejects`, { winner: winner.ok ? 'ok' : winner.error, loser: loser.ok ? 'resolved' : loser.error })
                judge.record('単一書き', 'store kept', _eq(store.tagsOf(), tags), tags, store.tagsOf())
                facade.life.dead = true
                await boot([], '単一書き')
        }
        await boot([], '永続')
        for (const step of script.steps) {
                judge.at(++index)
                if (aborted) break
                if (step.ctl === 'verify') await judge.full('窓', '装飾')
                if (step.ctl === 'recreate') await boot(step.faults, state.clean ? '永続' : '原子')
                if (step.ctl === 'stale') stale()
                if (step.ctl === 'rival') await rival(step.first)
                if (inst.dead) aborted ??= { index, error: inst.dead }
                if (!step.op) continue
                if (['undo', 'redo'].includes(step.op.type) && !model.canShift(step.op.id, step.op.type) && !model.fresh(step.op.id)) continue
                const res = await exec(step.op, step.faults)
                if (res.dropped || (step.op.type === 'open' && !res.ok && !res.hang)) await boot([], '原子')
        }
        if (inst) inst.facade.life.dead = true
        return { seed: script.seed, klass: script.klass, verdicts: judge.verdicts, failures: judge.failures, totals: store.totals, peaks, aborted, steps: index + 1 }
}
