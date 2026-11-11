import * as Y from 'yjs'
import { createModel, isValid } from './model.mjs'
import { createStore } from './store.mjs'
import { decodeStore, decodeDelta, CHUNK } from './codec.mjs'
import { createJudge, merges, attempt } from './judge.mjs'

export const hooks = { crash: null }
const [_IO, _READS, _eq] = [/disk I\/O error/, ['sql', 'save', 'window', 'leave', 'open'], (a, b) => JSON.stringify(a) === JSON.stringify(b)]
const _bytes = (op) => (Array.isArray(op.rows) ? op.rows.reduce((n, r) => n + 8 + (Array.isArray(r) ? r.reduce((b, t) => b + (typeof t === 'string' ? Buffer.byteLength(t) : 0), 0) : 0), 0) : typeof op.text === 'string' ? Buffer.byteLength(op.text) : 0)
const _race = (promise, ms, drop) => new Promise((resolve) => {
        const settle = ((timer) => (r) => (clearTimeout(timer), resolve(r)))(setTimeout(() => resolve({ ok: false, error: 'timeout', hang: true }), ms))
        ;(hooks.crash = (e) => settle({ ok: false, error: `crash: ${e?.message ?? e}`, hang: true })), (drop.fire = () => settle({ ok: false, error: 'dropped', dropped: true })), promise.then((value) => settle({ ok: true, value }), (error) => settle({ ok: false, error: String(error?.message ?? error) }))
})

export const replay = async (script, env) => {
        const store = createStore()
        const model = createModel()
        const judge = createJudge({ store, model })
        const state = { snap: model.snapshot(), touched: false, maybe: true, failedPut: null, putFault: false, diverged: false, prelude: false, clean: true, tag: '', del: null, ioerr: false, blind: false, rolled: false, redelete: false }
        const drop = { fire: null }
        let [inst, index, aborted] = [null, -1, null]
        const peaks = { afterOpen: 0, beforeSave: 0 }
        const scenes = { open3: 0, merge3: 0, reopenAfterPutFault: 0, crossed: 0, decorAfterDel: 0, saveNearLimit: 0, clients3: 0, divergedAtCheck: 0, ioerr: 0, blind: 0 }
        const count = (tags, suffix = '') => tags?.forEach((t) => (scenes[`${t}${suffix}`] = (scenes[`${t}${suffix}`] ?? 0) + 1))
        // put が reject した番号を次の save が確かめる時点で store が書かれていれば、製品は put を呼ばず store diverged で reject する (contract 3 節)
        const changed = () => state.failedPut !== null && (state.failedPut > 0 ? store.objects.has(state.failedPut) : (store.objects.get(0)?.tag ?? '') !== state.tag)
        const fresh = () => {
                if (inst) inst.facade.life.dead = true
                inst = ((facade, doc) => ({ facade, doc, db: env.createDb({ wasm: env.wasm, store: facade, doc }) }))(store.facade(), new Y.Doc())
                judge.use({ db: inst.db, doc: inst.doc, mutate: env.mutate, mutated: env.mutated, state, run: (op) => (inst.dead ? Promise.resolve({ ok: false, error: inst.dead, hang: true }) : _race(inst.db.run(op), env.timeout, drop).then((r) => ((inst.dead = r.hang ? r.error : inst.dead), r))) })
                Object.assign(state, { touched: false, maybe: true, failedPut: null, diverged: false, prelude: false, ioerr: false, blind: false, rolled: false, redelete: false })
        }
        // put 'after' は store には書けているが製品は失敗と受け取るので、製品の dirty は残る (rollback で残った dirty も、put が書けたときに消える)
        const saved = (list, res) => {
                const put = list.find((c) => c.kind === 'put')
                if (put?.wrote) state.snap = model.snapshot()
                if (put?.wrote && !put.fault) Object.assign(state, { touched: false, maybe: false, rolled: false, tag: store.objects.get(0)?.tag ?? '' })
                Object.assign(state, { failedPut: put ? (put.fault === 'reject' || put.fault === 'after' ? put.args[0] : null) : state.diverged || list.some((c) => c.fault) ? state.failedPut : null, putFault: !!put?.fault, clean: res.ok && !list.some((c) => c.fault) && !!put?.wrote, diverged: state.diverged || put?.fault === 'after', prelude: state.prelude || put?.fault === 'after' || put?.fault === 'null' })
        }
        // 障害で reject した書き込みは、SQL が変わっていなければ無かったことにし、変わっていれば commit 済み (refresh だけが失敗) と読む (contract 7 節)
        const expectOf = async (op, res, faulted, io) => {
                if (op.type === 'open') return (model.restore(state.snap), { status: 'ok', changed: false })
                if (!res.ok && /full/i.test(res.error)) return { status: 'full', changed: false }
                if (io || (faulted && !res.ok && op.type === 'window')) return (op.type === 'window' && model.windows.set(op.id, { unknown: true }), { status: io ? 'io' : 'faulted', changed: false })
                if (!faulted || res.ok || op.type === 'save') return model.apply(op)
                return res.dropped || (await judge.probe()) ? { status: 'faulted', changed: false } : { ...model.apply(op), status: 'faulted' }
        }
        const exec = async (op, faults = [], override = null, extra = null) => {
                if (op.type === 'save' && !state.diverged && changed()) (scenes.divergedAtCheck++, (state.diverged = true))
                const from = store.begin(index, faults, 'main', () => drop.fire?.())
                const [before, dBefore, payload, prior] = [inst.db.stat(), decodeStore(store.objects), model.payload() + _bytes(op), { ...state }]
                const [t0, run] = [Date.now(), _race(inst.db.run(op), env.timeout, drop)]
                const also = extra && ((t) => attempt(() => inst.db.run(extra)).then((r) => ({ ...r, op: extra, ms: Date.now() - t })))(Date.now()) // 直後に送る命令 (repro 用)。前の命令が終わるまで待たされる (issue 005)
                const res = await run
                const list = store.log.slice(from, store.begin(index)).filter((c) => c.origin === 'main')
                const faulted = list.some((c) => c.fault)
                // image の put が書いた後に reject したら、この save の判定の読みから open まで、memory に無い chunk の読みが disk I/O error で失敗してよい (contract 3 節、issue 003)
                if (op.type === 'save' && before.base > CHUNK && list.some((c) => c.kind === 'put' && c.args[0] === 0 && c.fault === 'after')) state.ioerr = true
                const io = prior.ioerr && !res.ok && _IO.test(res.error)
                if (io) (scenes.ioerr++, _READS.includes(op.type) || ((scenes.blind += state.blind ? 0 : 1), (state.blind = true)))
                if (op.type === 'open' && res.ok) Object.assign(state, { failedPut: null, putFault: false, diverged: false, prelude: false, touched: false, maybe: !store.objects.has(0), ioerr: false, blind: false, rolled: false, tag: store.objects.get(0)?.tag ?? '' })
                const after = res.hang ? before : inst.db.stat()
                const expect = override ?? (op.type === 'save' && prior.diverged ? { status: 'reject', changed: false } : await expectOf(op, res, faulted, io))
                await judge.step({ op, expect, res, calls: list, before, after, state: prior, dBefore, dAfter: decodeStore(store.objects), payload })
                if (expect.changed) state.touched = true
                else if (['cell', 'style', 'undo', 'redo'].includes(op.type)) state.maybe = true
                if (!res.ok && isValid(op) && !_READS.includes(op.type)) state.rolled = true // reject した書き込みは rollback されている (issue 004 の形の判別に使う)
                if (list.some((c) => c.kind === 'delete')) state.redelete = list.some((c) => c.kind === 'delete' && c.fault === 'reject') // 失敗した delete は次に store を呼ぶ save の最初でやり直される (contract 3 節)
                if (faulted || res.dropped) state.clean = false
                if (op.type === 'save') (saved(list, res), (peaks.beforeSave = Math.max(peaks.beforeSave, before.deltas)))
                if (op.type === 'open' && res.ok) ((peaks.afterOpen = Math.max(peaks.afterOpen, after.deltas)), dBefore.deltas >= 3 && scenes.open3++)
                if (op.type === 'save' && res.ok && before.dirty > 0 && dBefore.deltas >= 3 && merges(before)) scenes.merge3++
                if (op.type === 'save' && before.pages >= 8000) scenes.saveNearLimit++
                if (op.type === 'window' && res.ok && new Set([...model.windows].filter(([, w]) => w.page).map(([id]) => id)).size >= 3) scenes.clients3++
                if (['row.del', 'col.del'].includes(op.type)) state.del = { page: op.page, index }
                if (['cell', 'style'].includes(op.type) && state.del?.page === op.page && index - state.del.index <= 3) scenes.decorAfterDel++
                if (expect.status === 'full') count([`full.${op.type}`])
                env.trace?.({ index, op, expect, res, model, state, calls: list, tags: store.tagsOf(), ms: Date.now() - t0, also: also && !res.hang ? await also : undefined })
                if (res.hang || inst.dead) aborted ??= { index, error: res.hang ? res.error : inst.dead }
                return { ...res, faulted }
        }
        const boot = async (faults, axis, depth = 0) => {
                const res = await (state.putFault && depth === 0 && scenes.reopenAfterPutFault++, fresh(), exec({ type: 'open' }, faults))
                if (res.hang || (!res.ok && depth > 0)) return
                return res.ok ? (await judge.reopen(env.oracle, axis), await judge.full(axis, axis), (state.clean = true)) : boot([], axis, depth + 1)
        }
        // 鎖の外の delta (前に put した古い delta) を deltas + 1 に置く。次の open が鎖の切れ目として消すはず
        const stale = () => ((d, old) => d.base > CHUNK && old && !store.objects.has(d.deltas + 1) && (store.raw.put(d.deltas + 1, old.bytes, ''), (state.clean = false)))(decodeStore(store.objects), store.log.find((c) => c.kind === 'put' && c.bytes && decodeDelta(c.bytes)?.tag !== store.objects.get(decodeStore(store.objects).deltas)?.tag))
        // 2 つ目の writer。A と B の save が merge と push (またはその逆) に分かれたときは .bench/issues/001 の形 (1: B の push の後に A が merge、2: A の merge の後に B が push) なので known に '001' を付ける。判定は緩めない
        const rival = async ({ first, big }) => {
                if (state.diverged || changed()) return boot([], '単一書き') // A が store diverged の間は A の save が reject するのが正しいので、2 writer の判定はしない
                const facade = store.facade()
                const b = env.createDb({ wasm: env.wasm, store: facade, doc: new Y.Doc() })
                const bm = createModel()
                const runB = (op) => (store.begin(index, [], 'rival'), _race(b.run(op), env.timeout, drop))
                const putSeq = (origin) => store.log.findLast((c) => c.origin === origin && c.kind === 'put' && c.step === index)?.args[0]
                const crossed = (aSeq, bSeq) => (decodeStore(store.objects).base > CHUNK && aSeq !== undefined && bSeq !== undefined && (aSeq === 0) !== (bSeq === 0) ? '001' : undefined)
                ;(await runB({ type: 'open' }), bm.restore(state.snap))
                const pb = await (bm.apply({ type: 'page.add', page: `rival${index}` }), runB({ type: 'page.add', page: `rival${index}` }))
                const pa = first === 'A' ? await exec(big ?? { type: 'page.add', page: `main${index}` }) : null
                const a = first === 'A' ? await exec({ type: 'save' }) : null
                const tagsA = store.tagsOf()
                const sb = await runB({ type: 'save' })
                const tagsB = store.tagsOf()
                env.trace?.({ index, op: { type: 'save', by: 'B' }, res: sb, calls: store.log.filter((c) => c.origin === 'rival' && c.step === index && c.kind === 'put'), tags: tagsB })
                if (first !== 'A' && sb.ok) ((state.snap = bm.snapshot()), putSeq('rival') === 0 && decodeStore(store.objects).base > CHUNK && (state.ioerr = true)) // B が image を書き直したら、A が memory に無い chunk を読むと disk I/O error になる (contract 3 節の 003 と同じ仕組み。2 writer の読みは contract に無い。報告 007)
                const pa2 = first !== 'A' ? await exec(big ?? { type: 'page.add', page: `main${index}` }) : null
                const known = first !== 'A' ? crossed(merges(inst.db.stat()) ? 0 : 1, putSeq('rival')) : undefined
                const a2 = first !== 'A' ? await exec({ type: 'save' }, [], pb.ok && pa2.ok ? { status: 'reject', changed: false, known } : { status: 'ok', changed: false, rival: true }) : null
                const [winner, loser, tags, k] = first === 'A' ? [a, sb, tagsA, crossed(putSeq('main'), putSeq('rival'))] : [sb, a2, tagsB, known]
                const later = judge.seen('later', { winner: winner.ok, loser: loser.ok })
                // 両方の書き込みが通ったときだけ 2 writer の判定をする (上限で page.add が reject すると、save は何も put せず解決するのが正しい)
                if (pb.ok && (pa ?? pa2).ok) (judge.record('単一書き', 'later save rejects', later.winner && !later.loser, `${first} resolves, the other rejects`, { winner: winner.ok ? 'ok' : winner.error, loser: loser.ok ? 'resolved' : loser.error }, k), ((now) => judge.record('単一書き', 'store kept', _eq(now, tags), tags, now, k))(judge.seen('kept', store.tagsOf())))
                else scenes.rivalSkipped = (scenes.rivalSkipped ?? 0) + 1
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
                if (step.ctl === 'rival') await rival(step)
                if (inst.dead) aborted ??= { index, error: inst.dead }
                if (!step.op) { count(step.tags); continue }
                if (['undo', 'redo'].includes(step.op.type) && !env.force && !model.canShift(step.op.id)) continue // 無い位置への cell / style の後の undo / redo は期待値が無い (issue 002)。再現 (force) では走らせる
                const res = await exec(step.op, step.faults, null, step.also)
                ;(count(step.tags), res.faulted && count(step.tags, ':faulted'))
                if (res.dropped || (step.op.type === 'open' && !res.ok && !res.hang)) await boot([], '原子')
        }
        if (inst) inst.facade.life.dead = true
        scenes.crossed = model.stats.crossed
        return { seed: script.seed, klass: script.klass, verdicts: judge.verdicts, failures: judge.failures, totals: store.totals, peaks, scenes, aborted, steps: index + 1 }
}
