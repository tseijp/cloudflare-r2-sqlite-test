import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashFiles, listFiles } from './lib/hash.mjs'
import { readLatest, summaryOf, writeLedger } from './lib/ledger.mjs'
import { measureFixture } from './lib/measure.mjs'
import { isRunnerReferenced, loadProduct, probeProduct } from './lib/product.mjs'
import { scanFixtures } from './lib/scan.mjs'
import { classify, selectTargets } from './lib/select.mjs'
import { gatesOf } from './lib/gate.mjs'
import { scoreAll } from './lib/score.mjs'
import { createBucket } from './lib/storage.mjs'
import { createTree } from './lib/sync.mjs'

const BENCH = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(BENCH, '..')
const WINDOW = 50

const log = (text) => process.stderr.write(`[bench] ${text}\n`)

const srcHash = () => hashFiles(ROOT, listFiles(join(ROOT, 'src')))

const main = async () => {
        const t0 = performance.now()
        const at = new Date().toISOString()
        const srcStart = srcHash()
        const product = await loadProduct(ROOT)
        const probed = await probeProduct(product, { storage: createBucket(), doc: createTree().doc })
        const missing = Object.keys(probed.facets).filter((k) => !probed.facets[k])
        const state = product.ok ? 'loaded' : product.error
        log(`product ${product.entry}: ${state}; facets missing: ${missing.join(', ') || 'none'}`)
        const scanned = scanFixtures(join(BENCH, 'data')).map((s) => classify(s, probed.page_size - 35, WINDOW))
        const selected = selectTargets(scanned)
        const results = []
        for (const target of selected.targets)
                results.push(await measureFixture(target, product, probed.page_size, WINDOW, log))
        const srcEnd = srcHash()
        const runnerReferenced = isRunnerReferenced(ROOT)
        const flags = {
                productMissing: missing,
                missingClasses: selected.missing,
                runnerReferenced,
                srcChanged: srcStart !== srcEnd,
        }
        const scored = scoreAll(results)
        const gates = gatesOf(results, flags)
        const isGated = Object.values(gates).some(Boolean)
        const runnerHash = hashFiles(ROOT, [join(BENCH, 'run.mjs'), ...listFiles(join(BENCH, 'lib'))])
        const previous = readLatest(join(BENCH, 'out'))
        const ledger = {
                at,
                runner_hash: runnerHash,
                src_hash: srcStart,
                src_hash_end: srcEnd,
                runner_changed: previous ? previous.runner_hash !== runnerHash : true,
                fixtures: selected.targets.map((t) => ({
                        name: t.name,
                        role: t.role,
                        class: t.class,
                        rows: t.rows,
                        cols: t.cols,
                })),
                missing_classes: selected.missing,
                product: { entry: product.entry, error: product.error, ...probed, facets_missing: missing },
                window: WINDOW,
                axes: scored.axes,
                score: isGated ? 0 : scored.total,
                score_before_gates: scored.total,
                gates,
                frames_mismatch: results.flatMap((r) => (r.edit.frames_mismatch ?? []).map((op) => `${r.name}:${op}`)),
                runner_referenced: runnerReferenced,
                duration_ms: performance.now() - t0,
                scan: scanned.map(({ file, ...s }) => s),
                results,
        }
        const file = writeLedger(join(BENCH, 'out'), ledger)
        process.stdout.write(`${summaryOf(ledger, previous)}\nledger ${file}\n`)
}

main()
