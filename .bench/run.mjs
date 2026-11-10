import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOUNDS, createOracle, generate, hooks, replay, shrink, signature } from '../test/index.mjs'

const _BENCH = dirname(fileURLToPath(import.meta.url))
const _ROOT = dirname(_BENCH)
const _AXES = ['永続', '原子', '回数', '鎖', '単一書き', '上限', 'compile', '装飾', '窓', '履歴']
const _SHRINK = { small: [40, 3], medium: [8, 2], large: [2, 1] }
const _TIMEOUT = 8000
const _UNMEASURED = [
        'pragma integrity_check は製品の sql が not authorized で拒むため、store の object を contract 4 節どおりに復号し別の wa-sqlite で実行した',
        '<id>/styles に row = 0 (列見出し) の行が載るかは contract に無いため、比較の前に両側から row = 0 を除いた',
        'open を同じ instance で呼んだ後に <id>/* の key が残るかは contract に無いため判定しない (作り直しは新しい doc)',
        'marks に同じ (start, name) が 2 つある cell、page.del の対象 page に window が登録されている場合、import の names に既存 page に無い列がある場合、既存の名前と大文字小文字だけ違う参照、astral 文字の長さは生成しない',
        'ok と reject のどちらも contract に無い意味的な外れ (無い page / 列、重複する page 名など) は status を判定せず、内容が変わらないことだけを判定する。無い行への cell / style / row.del は contract 2 節に従い解決を期待する',
        '12 MiB 〜 32 MiB の payload の import は full で拒まれても通っても判定しない',
        'put が null を返した後の save は、contract 3 節の「store が変わっていなければ続行」と読み、通常の命令列 (先頭に get(seq, 0, 1) があってもよい) を期待する',
        'image が 1 chunk のとき open は delta を読まないので、delete の失敗で残った delta が open で消えることは判定しない (save の後だけ判定する)',
]
const _clip = (v) => {
        const s = JSON.stringify(v)
        return s === undefined || s.length <= 1500 ? v : `${s.slice(0, 1500)}… (${s.length} 文字)`
}
const _log = (text) => process.stderr.write(`${text}\n`)
process.on('unhandledRejection', (e) => hooks.crash?.(e))
process.on('uncaughtException', (e) => hooks.crash?.(e))

const _main = async () => {
        const t0 = Date.now()
        const [from, to] = (process.argv[2] ?? '1-40').split('-').map(Number)
        const { createDb } = await import(pathToFileURL(join(_ROOT, 'src/server/db/src/index.ts')).href)
        const wasm = new WebAssembly.Module(readFileSync(join(_ROOT, 'node_modules/wa-sqlite/dist/wa-sqlite-async.wasm')))
        const env = { createDb, wasm, oracle: await createOracle(_ROOT), timeout: _TIMEOUT }
        const axes = Object.fromEntries(_AXES.map((a) => [a, { judged: 0, passed: 0, score: 0 }]))
        const whats = {}
        const failures = new Map()
        const store = { get: 0, put: 0, delete: 0, getBytes: 0, putBytes: 0, push: 0, merge: 0 }
        const aborted = []
        const deltas = { afterOpen: 0, beforeSave: 0 }
        for (let seed = from; seed <= to; seed++) {
                const t1 = Date.now()
                const script = generate(seed, join(_BENCH, 'data'))
                const r = await replay(script, env)
                for (const v of r.verdicts) (axes[v.axis].judged++, (axes[v.axis].passed += v.ok ? 1 : 0))
                for (const v of r.verdicts) ((whats[`${v.axis}/${v.what}`] ??= { judged: 0, passed: 0 }).judged++, (whats[`${v.axis}/${v.what}`].passed += v.ok ? 1 : 0))
                for (const k in store) store[k] += r.totals[k]
                if (r.aborted) aborted.push({ seed, ...r.aborted })
                for (const k in deltas) deltas[k] = Math.max(deltas[k], r.peaks[k])
                const seen = new Set()
                for (const f of r.failures) {
                        if (seen.has(signature(f)) || seen.size >= _SHRINK[script.klass][1]) continue
                        seen.add(signature(f))
                        const s = await shrink(script, f, (sc) => replay(sc, env), _SHRINK[script.klass][0])
                        const key = `${signature(f)}|${JSON.stringify(s.failure.observed).slice(0, 80)}`
                        const prev = failures.get(key)
                        if (prev && prev.steps.length <= s.steps.length) (prev.count++, prev.seeds.push(seed))
                        else failures.set(key, { seed, axis: f.axis, what: f.what, count: (prev?.count ?? 0) + 1, seeds: [...(prev?.seeds ?? []), seed], steps: s.steps, expected: _clip(s.failure.expected), observed: _clip(s.failure.observed), shrinkRuns: s.runs })
                }
                _log(`seed ${seed} ${script.klass} ${r.steps}/${script.steps.length} steps, ${r.failures.length} failures, ${r.aborted ? `aborted at ${r.aborted.index} (${r.aborted.error})` : 'done'}, ${((Date.now() - t1) / 1000).toFixed(1)}s`)
        }
        for (const a of _AXES) axes[a].score = axes[a].judged ? Math.floor((axes[a].passed / axes[a].judged) * 100) : 0
        const ledger = {
                at: new Date(t0).toISOString(),
                seeds: [from, to],
                bounds: { ...BOUNDS, timeoutMs: _TIMEOUT, shrink: { '[replay 回数, 1 seed あたりの signature 数]': _SHRINK }, abort: 'hang / crash した simulation はそこで止める', bigTable: '20,000 行を超える page の毎 step の指紋 (count / total) は 8 step に 1 回。verify と作り直しの全件比較は毎回', axesOfContent: '表の内容は 窓、_style / _mark は 装飾、undo / redo の後は 履歴、作り直し後は 永続 / 原子 / 単一書き' },
                axes,
                whats,
                score: _AXES.reduce((n, a) => n + axes[a].score, 0),
                failures: [...failures.values()],
                store,
                deltas,
                aborted,
                unmeasured: _UNMEASURED,
                seconds: (Date.now() - t0) / 1000,
        }
        mkdirSync(join(_BENCH, 'out'), { recursive: true })
        const path = join(_BENCH, 'out', `${ledger.at}.json`)
        writeFileSync(path, JSON.stringify(ledger, null, 8))
        process.stdout.write(`${path}\n${_AXES.map((a) => `${a} ${axes[a].passed}/${axes[a].judged} ${axes[a].score}`).join('\n')}\nscore ${ledger.score}\nfailures ${ledger.failures.length} (${[...failures.values()].reduce((n, f) => n + f.count, 0)})\n${ledger.seconds.toFixed(1)}s\n`)
}

_main().then(() => process.exit(0))
