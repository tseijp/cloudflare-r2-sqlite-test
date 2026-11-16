import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, createServerModuleRunner } from 'vite'
import { packages } from '../packages.mjs'
import { ledgerOf } from './ledger.mjs'

const _SELF = fileURLToPath(import.meta.url)

const _ROOT = resolve(dirname(_SELF), '..')

const _MARK = '@record '

const _LIMIT = Number(process.env.BENCH_LIMIT ?? 3600)

const _load = async (file) => {
        const server = await createServer({ root: _ROOT, configFile: false, logLevel: process.env.BENCH_LOG ?? 'error', appType: 'custom', plugins: [packages()], server: { middlewareMode: true, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
        const runner = createServerModuleRunner(server.environments.ssr, { hmr: false })
        const mod = await runner.import(resolve(file))
        process.stdout.write(`${_MARK}${JSON.stringify(mod.default ?? null)}\n`)
        await runner.close()
        await server.close()
}

const _spawn = (file, rest) =>
        new Promise((done) => {
                const child = spawn(process.execPath, [_SELF, '--child', file, ...rest], { cwd: _ROOT, stdio: ['ignore', 'pipe', 'inherit'] })
                const timer = setTimeout(() => child.kill('SIGKILL'), _LIMIT * 1000)
                let text = ''
                child.stdout.on('data', (chunk) => (text += chunk))
                child.on('close', (code, signal) => (clearTimeout(timer), done({ file, code, signal, text })))
        })

const _recordOf = (text) => {
        const line = text.split('\n').find((row) => row.startsWith(_MARK))
        return line ? JSON.parse(line.slice(_MARK.length)) : null
}

const _report = ({ file, code, signal, text }) => {
        const record = _recordOf(text)
        const fails = record?.fails ?? []
        const isKilled = signal === 'SIGKILL'
        const isBroken = code !== 0 || !record || fails.some((fail) => !fail.known)
        const axes = Object.entries(record?.axes ?? {}).map(([axis, count]) => `${axis} ${count.pass}/${count.pass + count.fail + count.known}`)
        const head = isKilled ? 'timeout' : isBroken ? 'fail' : fails.length ? 'known' : 'pass'
        process.stdout.write(text.split('\n').filter((row) => row && !row.startsWith(_MARK)).map((row) => `  ${row}\n`).join(''))
        process.stdout.write(`${head} ${record?.file ?? relative(_ROOT, resolve(file))} ${record?.title ?? ''}\n  ${axes.join(' ')}\n`)
        for (const note of record?.notes ?? []) process.stdout.write(`  note ${note}\n`)
        for (const fail of fails) process.stdout.write(`  ${fail.known ? `known ${fail.known}` : 'fail'} [${fail.axis}] ${fail.note} (step ${fail.at})\n`)
        return { record, code: isKilled ? 124 : isBroken ? 1 : 0 }
}

const _seedsOf = (range) => {
        const [from, to = from] = range.split('-').map(Number)
        return Array.from({ length: to - from + 1 }, (_, at) => String(from + at))
}

const _write = (records, spec, seconds) => {
        const ledger = ledgerOf(records, spec, seconds)
        mkdirSync(join(_ROOT, '.bench/out'), { recursive: true })
        writeFileSync(join(_ROOT, `.bench/out/${ledger.at}.json`), JSON.stringify(ledger, null, 2))
        process.stdout.write(`score ${ledger.score} / ${Object.keys(ledger.axes).length * 100} ${Object.entries(ledger.axes).map(([axis, { point }]) => `${axis} ${point}`).join(' ')}\n`)
        process.stdout.write(`unreached ${ledger.unmeasured.join(' ') || 'none'}\nledger .bench/out/${ledger.at}.json\n`)
}

const _main = async (args) => {
        const files = args.filter((arg) => arg.endsWith('.ts'))
        const rest = args.filter((arg) => !arg.endsWith('.ts'))
        const isSeeds = files.length === 1 && files[0].endsWith('seed.ts') && /^\d+(-\d+)?$/.test(rest[0] ?? '')
        const jobs = isSeeds ? _seedsOf(rest[0]).map((seed) => [files[0], [seed, ...rest.slice(1)]]) : files.map((file) => [file, rest])
        const started = Date.now()
        const done = []
        for (const [file, tail] of jobs) done.push(_report(await _spawn(file, tail)))
        if (isSeeds) _write(done.map(({ record }) => record).filter(Boolean), { seeds: rest[0], steps: Number(rest[1] ?? 60), mode: rest[2] ?? '' }, (Date.now() - started) / 1000)
        process.exit(done.some(({ code }) => code === 124) ? 124 : done.some(({ code }) => code === 1) ? 1 : 0)
}

const _args = process.argv.slice(2)

if (_args[0] === '--child') await _load(_args[1]).then(() => process.exit(0))

if (_args[0] !== '--child') await _main(_args)
