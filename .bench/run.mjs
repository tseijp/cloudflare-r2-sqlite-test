import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOUNDS, createOracle, generate, hooks, replay, shrink, signature } from '../test/index.mjs'
import { MUTATIONS } from '../test/mutate.mjs'

const [_BENCH, _ROOT] = ((b) => [b, dirname(b)])(dirname(fileURLToPath(import.meta.url)))
const _AXES = ['永続', '原子', '回数', '鎖', '単一書き', '上限', 'compile', '装飾', '窓', '履歴']
const [_SHRINK, _TIMEOUT] = [{ small: [40, 3], medium: [8, 2], large: [2, 1] }, 8000]
const _UNMEASURED = ['pragma integrity_check は製品の sql が not authorized で拒むため、store の object を contract 4 節どおりに復号し別の wa-sqlite で実行した。<id>/styles に row = 0 (列見出し) の行が載るかは contract に無いため、比較の前に両側から row = 0 を除いた。open を同じ instance で呼んだ後に <id>/* の key が残るかは contract に無いため判定しない (作り直しは新しい doc)', 'astral 文字を含む本文の長さは生成しない。大文字小文字だけ違う名前への col.name は、同名への col.name の半分 (steps.length % 4 < 2) として生成する。位置が無いとき、名前が重なるとき、page.del と窓の登録、大文字小文字だけ違う col.name の結果は contract 5 節の表から期待する。12 MiB 〜 32 MiB の payload の書き込みは full で拒まれても通っても判定しない (full なら内容が変わらないことだけを判定する)', '大文字小文字だけ違う page / col (contract 9 節) は、本文と装飾が同じ位置に当たり、新しく入る装飾の行は渡された綴り、既にある key への style は綴りを保って値だけ変わる (upsert)、cell は _mark を消して入れ直すので渡された綴りになる、col.name は装飾の col を新しい名前の綴りにする、と読む。編集の履歴の key は渡された綴りで、undo / redo はその綴りで命令を流し直すと読む。既にある key への style が綴りを変えるかは contract に無い',
        'put が null を返した後の save は、contract 3 節の「store が変わっていなければ続行」と読み、通常の命令列 (先頭に get(seq, 0, 1) があってもよい) を期待する。put が reject した番号を次の save が確かめる時点で store がその番号を書かれていれば (delta なら在る、image なら tag が違う)、put を呼ばず store diverged で reject し、以後 open まで get(seq, 0, 1) 1 回だけを期待する。merge の get(0) の tag が覚えている tag と違えば get(0) だけ (image changed、put 無し) を期待する。merge の delete は image が 2 chunk 以上なら delta の数に依らず 1 〜 SLOTS を期待する。delete の失敗で残った delta は、次に store を呼ぶ save (dirty > 0) か open の後にだけ消えたことを判定する (image が 1 chunk のとき open は delta を読まないので判定しない)。image の put が書いた後に reject した後 (base > CHUNK) は、その save の判定の読みから open し直すまで disk I/O error で失敗した読みを判定しない (contract 3 節、issue 003)。その状態で書き込みの命令が disk I/O error で失敗したら、commit されたかを SQL で確かめられないので、次の open まで内容と窓の判定を止める (scenes.blind)。確認の get と残った delta の delete の順は contract に無く、get を先に期待する', 'undo / redo の期待値は grid.md 5 節と errata.md 5 節が指す yjs 13.6 の UndoManager (ignoreRemoteMapChanges = false、1 命令 1 stack item、fill は履歴に入らない) を model に写したもの。無い行への cell / style と無い列への style をした client の undo / redo は、履歴に入るかが contract に無いため判定しない (issue 002)。get の障害で reject した書き込みは、SQL の内容が命令前の model と一致すれば無かったことに、違えば commit 済みで refresh だけが失敗した (contract 7 節) と読んで model に適用し、その step の view は判定しない。障害で reject した window の <id>/* は次の window / leave まで判定しない (途中まで登録された view が残るため)。2 writer の判定は両方の書き込みが通ったときだけ行う (上限で page.add が reject した save は何も put しない)。2 × ROWS 行以下の table は毎 step 全行を比べ、それより大きい table は count と合計の指紋 (page table は octet_length と length、_style / _mark は octet_length × 16 + hex の 6 と 7 の桁数) で比べる。undo / redo が触れた key の値は table の大きさに依らず直接読んで比べる', '既知として別に数えるもの (判定は緩めない): 単一書きで A の save が merge、B の save が push (またはその逆) になった判定は .bench/issues/001 の形として known = 001。reject した有効な書き込み (rollback 済み) の後、変化の無い save が put したら .bench/issues/004 の形として known = 004。005 (重い sql の間、他の命令が待たされる) は simulation では判定せず .bench/issues/005.json の repro で示す']
const _clip = (v) => ((s) => (s === undefined || s.length <= 1500 ? v : `${s.slice(0, 1500)}… (${s.length} 文字)`))(JSON.stringify(v))
const _short = (v) => (typeof v === 'string' && v.length > 120 ? `${v.slice(0, 48)}… (${v.length} 文字)` : Array.isArray(v) ? v.map(_short) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, _short(x)])) : v)
// 台帳の操作列は、CSV の行を file 名と位置 (src) に、長い本文を先頭と長さに置き換える (依頼 1)
const _compact = ({ src, op, big, ...step }) => _short({ ...step, op: op?.rows ? { ...op, rows: src ?? { count: op.rows.length, head: op.rows.slice(0, 2) } } : op, big: big && { ...big, rows: src ?? `${big.rows.length} rows` } })
const _log = (text) => process.stderr.write(`${text}\n`)
for (const ev of ['unhandledRejection', 'uncaughtException']) process.on(ev, (e) => hooks.crash?.(e))

// 依頼 1: 変え方ごとに全 seed を走らせ、変えた回数 (applied) と、直後の判定が崩れを報告した回数 (caught) / しなかった回数 (missed) を数える
const _mutate = async (env, from, to, only) => {
        const out = {}
        for (const name of Object.keys(MUTATIONS).filter((n) => !only || n === only)) {
                const tally = (out[name] = { applied: 0, caught: 0, missed: 0, missedAt: [] })
                const mutated = (axis, what, ok) => (tally.applied++, ok ? tally.missed++ && tally.missedAt.length < 20 && tally.missedAt.push(`${axis}/${what}`) : tally.caught++)
                for (let seed = from; seed <= to; seed++) await replay(generate(seed, join(_BENCH, 'data')), { ...env, mutate: MUTATIONS[name], mutated })
                _log(`${name} applied ${tally.applied} caught ${tally.caught} missed ${tally.missed}`)
        }
        ;((path) => (writeFileSync(path, JSON.stringify({ seeds: [from, to], mutations: out }, null, 2)), process.stdout.write(`${path}\n`)))(join(_BENCH, 'out', `${new Date().toISOString()}.mutate.json`))
}

// issue の再現: .bench/issues/<n>.json の操作列 (rows.fill = [行数, 文字数] は展開する) を走らせ、step ごとの結果と store の object、崩れた判定の期待と観測を出す
const _repro = async (env, path) => {
        const script = JSON.parse(readFileSync(path, 'utf8'))
        const fill = (op) => (Array.isArray(op?.rows?.fill) ? { ...op, rows: Array.from({ length: op.rows.fill[0] }, (_, i) => [`r${i} ${'x'.repeat(op.rows.fill[1])}`]) } : op)
        const lines = []
        const head = (o) => `${o.by ?? 'A'} ${o.type}${o.page ? ` ${o.page}` : ''}${o.row !== undefined ? ` row ${o.row}` : ''}${o.text ? ` ${o.type === 'sql' ? _short(o.text) : `'${o.text}'`}` : ''}`
        const tail = (o, r, ms) => `-> ${r.ok ? `ok${r.value?.length ? ` ${JSON.stringify(r.value).slice(0, 40)}` : ''}` : `reject: ${r.error}`}${o.type === 'sql' ? ` ${ms}ms` : ''}`
        const trace = ({ index, op, res, calls, tags, ms, also }) => {
                ;(lines[index + 1] ??= []).push(`${head(op)} ${tail(op, res, ms)}${calls.length ? ` calls ${JSON.stringify(calls.map((c) => [c.kind, ...c.args.map((a) => (typeof a === 'number' && a > 99 ? '…' : a)), c.fault ?? ''].filter((a) => a !== '')))}` : ''} store ${JSON.stringify(tags)}`)
                if (also) lines[index + 1].push(`${head(also.op)} (直後に送った) ${tail(also.op, also, also.ms)}`) // 前の命令が終わるまで待たされた時間 (issue 005)
        }
        const r = await replay({ seed: 0, klass: 'small', steps: script.steps.map((s) => ({ faults: [], tags: [], ...s, op: fill(s.op), big: fill(s.big) })) }, { ...env, trace, force: true })
        const seen = new Set()
        for (const f of r.failures) if (!seen.has(`${f.index}|${f.axis}|${f.what}`)) (seen.add(`${f.index}|${f.axis}|${f.what}`), (lines[f.index + 1] ??= []).push(`崩れ ${f.axis}/${f.what}${f.known ? ` (既知 ${f.known})` : ''} 期待 ${JSON.stringify(f.expected).slice(0, 120)} 観測 ${JSON.stringify(f.observed).slice(0, 160)}`))
        process.stdout.write(`${script.note}\n${lines.flatMap((l, i) => l.map((t) => `${i - 1} ${t}`)).join('\n')}\n`)
}

// 60 seed ずつ別 process で走らせた台帳を 1 つに足す (捨てた wasm instance の memory が process の終わりまで戻らないため、300 seed を 1 process では走らせない)
const _merge = (paths) => {
        const parts = paths.map((p) => JSON.parse(readFileSync(p, 'utf8')))
        const sum = (key) => parts.reduce((o, p) => (Object.entries(p[key]).forEach(([k, v]) => (o[k] = typeof v === 'number' ? (o[k] ?? 0) + v : { judged: (o[k]?.judged ?? 0) + v.judged, passed: (o[k]?.passed ?? 0) + v.passed })), o), {})
        const axes = sum('axes')
        for (const a of _AXES) axes[a].score = axes[a].judged ? Math.floor((axes[a].passed / axes[a].judged) * 100) : 0
        const ledger = { ...parts[0], at: new Date().toISOString(), seeds: [Math.min(...parts.map((p) => p.seeds[0])), Math.max(...parts.map((p) => p.seeds[1]))], parts: parts.map((p) => p.seeds), axes, whats: sum('whats'), known: sum('known'), store: sum('store'), deltas: { afterOpen: Math.max(...parts.map((p) => p.deltas.afterOpen)), beforeSave: Math.max(...parts.map((p) => p.deltas.beforeSave)) }, scenes: sum('scenes'), aborted: parts.flatMap((p) => p.aborted), score: _AXES.reduce((n, a) => n + axes[a].score, 0), failures: parts.flatMap((p) => p.failures), seconds: parts.reduce((n, p) => n + p.seconds, 0) }
        ;((path) => (writeFileSync(path, JSON.stringify(ledger, null, 2)), process.stdout.write(`${path}\nscore ${ledger.score} known ${JSON.stringify(ledger.known)} failures ${ledger.failures.length}\n`)))(join(_BENCH, 'out', `${ledger.at}.json`))
}

const _main = async () => {
        const t0 = Date.now()
        if (process.argv[2] === 'merge') return _merge(process.argv.slice(3))
        const { createDb } = await import(pathToFileURL(join(_ROOT, 'src/server/db/src/index.ts')).href)
        const wasm = new WebAssembly.Module(readFileSync(join(_ROOT, 'node_modules/wa-sqlite/dist/wa-sqlite-async.wasm')))
        const env = { createDb, wasm, oracle: await createOracle(_ROOT), timeout: _TIMEOUT }
        if (process.argv[2] === 'repro') return _repro(env, process.argv[3])
        const [from, to] = (process.argv[2] ?? '1-40').split('-').map(Number)
        if (process.argv[3] === 'mutate') return _mutate(env, from, to, process.argv[4])
        const axes = Object.fromEntries(_AXES.map((a) => [a, { judged: 0, passed: 0, score: 0 }]))
        const [whats, known, failures, aborted, scenes] = [{}, {}, new Map(), [], {}]
        const store = { get: 0, put: 0, delete: 0, getBytes: 0, putBytes: 0, push: 0, merge: 0 }
        const deltas = { afterOpen: 0, beforeSave: 0 }
        for (let seed = from; seed <= to; seed++) {
                const t1 = Date.now()
                let script = { klass: 'small', mode: '?', steps: [] }
                const r = await Promise.resolve().then(() => replay((script = generate(seed, join(_BENCH, 'data'))), env)).catch((e) => ({ verdicts: [], failures: [], totals: {}, peaks: {}, scenes: {}, aborted: { index: -1, error: `crash: ${e?.stack ?? e}` }, steps: 0 }))
                for (const v of r.verdicts) (axes[v.axis].judged++, (axes[v.axis].passed += v.ok ? 1 : 0), (whats[`${v.axis}/${v.what}`] ??= { judged: 0, passed: 0 }).judged++, (whats[`${v.axis}/${v.what}`].passed += v.ok ? 1 : 0), !v.ok && v.known && (known[v.known] = (known[v.known] ?? 0) + 1))
                ;(Object.keys(store).forEach((k) => (store[k] += r.totals[k])), r.aborted && aborted.push({ seed, ...r.aborted }))
                for (const k in deltas) deltas[k] = Math.max(deltas[k], r.peaks[k])
                for (const k in r.scenes) scenes[k] = (scenes[k] ?? 0) + r.scenes[k]
                const seen = new Set()
                for (const f of r.failures) {
                        if (seen.has(signature(f)) || seen.size >= _SHRINK[script.klass][1]) continue
                        seen.add(signature(f))
                        const short = f.known && [...failures.values()].find((x) => x.known === f.known && x.axis === f.axis && x.what === f.what && x.steps.length <= 6) // 既知の形に 6 step 以下の再現が既にあれば、縮めずに seed を数えるだけ
                        if (short) { ;(short.count++, short.seeds.push(seed)); continue }
                        const s = await shrink(script, f, (sc) => replay(sc, env), _SHRINK[script.klass][0])
                        const key = `${signature(f)}|${f.known ?? ''}|${JSON.stringify(s.failure.observed).slice(0, 80)}`
                        const prev = failures.get(key)
                        if (prev && prev.steps.length <= s.steps.length) (prev.count++, prev.seeds.push(seed))
                        else failures.set(key, { seed, axis: f.axis, what: f.what, known: f.known, count: (prev?.count ?? 0) + 1, seeds: [...(prev?.seeds ?? []), seed], steps: s.steps.map(_compact), expected: _clip(s.failure.expected), observed: _clip(s.failure.observed), shrinkRuns: s.runs })
                }
                _log(`seed ${seed} ${script.klass} ${script.mode} ${r.steps}/${script.steps.length} steps, ${r.failures.length} failures, ${r.aborted ? `aborted at ${r.aborted.index} (${r.aborted.error})` : 'done'}, ${((Date.now() - t1) / 1000).toFixed(1)}s, rss ${(process.memoryUsage().rss / 2 ** 20).toFixed(0)} MiB`)
        }
        for (const a of _AXES) axes[a].score = axes[a].judged ? Math.floor((axes[a].passed / axes[a].judged) * 100) : 0
        const bounds = { ...BOUNDS, timeoutMs: _TIMEOUT, shrink: { '[replay 回数, 1 seed あたりの signature 数]': _SHRINK, known: '既知 (001 / 004 / 006) の形に 6 step 以下の再現が既にあれば縮めず、seed と件数だけ足す' }, abort: 'hang / crash した simulation はそこで止める', bigTable: '20,000 行を超える page の毎 step の指紋は 8 step に 1 回。verify と作り直しの全件比較は毎回', axesOfContent: '表の内容は 窓、_style / _mark は 装飾、undo / redo の後は 履歴、作り直し後は 永続 / 原子 / 単一書き' }
        const ledger = { at: new Date(t0).toISOString(), seeds: [from, to], bounds, axes, whats, known, store, deltas, scenes, aborted, unmeasured: _UNMEASURED, score: _AXES.reduce((n, a) => n + axes[a].score, 0), failures: [...failures.values()], seconds: (Date.now() - t0) / 1000 }
        const path = (mkdirSync(join(_BENCH, 'out'), { recursive: true }), join(_BENCH, 'out', `${ledger.at}.json`))
        writeFileSync(path, JSON.stringify(ledger, null, 2))
        process.stdout.write(`${path}\n${_AXES.map((a) => `${a} ${axes[a].passed}/${axes[a].judged} ${axes[a].score}`).join('\n')}\nscore ${ledger.score}\nknown ${JSON.stringify(known)}\nfailures ${ledger.failures.length} (${[...failures.values()].reduce((n, f) => n + f.count, 0)})\n${ledger.seconds.toFixed(1)}s\n`)
}

_main().then(() => process.exit(0))
