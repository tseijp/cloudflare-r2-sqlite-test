import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { installHook } from './lib/hook.mjs'
import { measureEdit } from './lib/edit.mjs'
import { gatesOf } from './lib/gate.mjs'
import { measureIntake } from './lib/intake.mjs'
import { FORMAT, hashOf, referencesOf, runnerFiles, srcFiles, writeLedger } from './lib/ledger.mjs'
import { dumpPair, measureObserve } from './lib/observe.mjs'
import { measureSave } from './lib/save.mjs'
import { scanData, WINDOW } from './lib/scan.mjs'
import { scoreRun } from './lib/score.mjs'
import { readFixture, selectTargets } from './lib/select.mjs'
import { closeSide, probeSide } from './lib/side.mjs'
import { guard } from './lib/sql.mjs'
import { measureStyle } from './lib/style.mjs'
import { summarize } from './lib/summary.mjs'
import { measureSync, snapshotPair } from './lib/sync.mjs'
import { measureWindow } from './lib/window.mjs'

const _BENCH = dirname(fileURLToPath(import.meta.url))
const _ROOT = dirname(_BENCH)
const _DATA = join(_BENCH, 'data')
const _OUT = join(_BENCH, 'out')
const _T0 = Date.now()

const _log = (text) => process.stderr.write(`[bench ${((Date.now() - _T0) / 1000).toFixed(1)}s] ${text}\n`)

const _STEPS = [
        ['window', (openDb, ctx) => measureWindow(openDb, ctx)],
        ['edit', (openDb, ctx) => measureEdit(ctx)],
        ['save', (openDb, ctx) => measureSave(openDb, ctx)],
        ['style', (openDb, ctx) => measureStyle(ctx)],
        ['sync', (openDb, ctx) => measureSync(ctx)],
        ['observe', (openDb, ctx) => measureObserve(ctx)],
]

const _measure = async (openDb, fixture) => {
        _log(`${fixture.file} (${fixture.role}) 取込`)
        const intake = await measureIntake(openDb, fixture, readFixture(_DATA, fixture.file))
        const head = { file: fixture.file, role: fixture.role, class: fixture.class }
        const out = { ...head, intake: intake.value ?? null, error: intake.error }
        const ctx = { fixture, sides: intake.sides, page: intake.page, pageT: intake.pageT, intake: intake.value }
        if (intake.ok) {
                ctx.snapshot = snapshotPair(ctx)
                ctx.dump = await dumpPair(ctx)
                for (const [key, run] of _STEPS) {
                        _log(`${fixture.file} ${key}`)
                        const res = await guard(() => run(openDb, ctx))
                        out[key] = res.value ?? { error: res.error }
                        ctx[key] = out[key]
                }
        }
        await closeSide(intake.sides.n)
        await closeSide(intake.sides.t)
        return out
}

const _main = async () => {
        installHook()
        const srcStart = hashOf(_ROOT, srcFiles(_ROOT))
        const { openDb } = await import(pathToFileURL(join(_ROOT, 'src/server/db/index.ts')).href)
        const head = await probeSide(openDb)
        const limit = head.usable - 35
        _log(`page size ${head.pageSize}、leaf の上限 ${limit} byte、fixture を走査`)
        const scanned = scanData(_DATA, limit, (file) => _log(`走査 ${file}`))
        const { targets, missing } = selectTargets(scanned)
        const measured = []
        for (const fixture of targets) measured.push(await _measure(openDb, fixture))
        const scored = scoreRun(measured)
        const srcEnd = hashOf(_ROOT, srcFiles(_ROOT))
        const gates = gatesOf(measured, { missing, refs: referencesOf(_ROOT), srcStart, srcEnd })
        const isPass = gates.every((g) => g.ok)
        const ledger = {
                format: FORMAT,
                at: new Date().toISOString(),
                runner_hash: hashOf(_BENCH, runnerFiles(_BENCH)),
                src_hash: srcEnd,
                runner_changed: true,
                node: process.version,
                window: WINDOW,
                page_size: head.pageSize,
                leaf_limit: limit,
                fixtures: targets,
                scanned,
                missing,
                axes: scored.axes,
                score_before_gates: scored.sum,
                score: isPass ? scored.sum : 0,
                gates,
                measured,
                seconds: (Date.now() - _T0) / 1000,
        }
        const { path, diff } = writeLedger(_OUT, ledger)
        _log(`台帳 ${path}`)
        process.stdout.write(summarize({ ...ledger, diff }) + '\n')
}

_main().then(
        () => process.exit(0),
        (error) => {
                process.stderr.write(`[bench] 失敗: ${error?.stack ?? error}\n`)
                process.exit(1)
        },
)
