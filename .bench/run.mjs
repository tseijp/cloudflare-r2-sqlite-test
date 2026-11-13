import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from './launch.mjs'

const _ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

const _SERVER = { middlewareMode: true, ws: false, hmr: false, watch: null }

const _CONFIG = { root: _ROOT, configFile: join(_ROOT, 'test/vite.config.ts'), appType: 'custom', logLevel: 'error' }

// 子 process。file を vite の module runner で読み込み、default export (記録) を親に送る
const _load = async (file) => {
        const { createServer, createServerModuleRunner } = await import('vite')
        const server = await createServer({ ..._CONFIG, server: _SERVER })
        const runner = createServerModuleRunner(server.environments.ssr, { hmr: false })
        const module = await runner.import(resolve(file))
        await new Promise((done) => process.send({ tally: module.default ?? null }, done))
        await runner.close()
        await server.close()
}

// 1 file の結果を 1 行にする。崩れの数、既知の数、打ち切り、終了 code、秒
const _line = ({ file, tally, limit, code, seconds }) => {
        const failures = tally?.failures ?? []
        const known = failures.filter((failure) => failure.known).length
        const text = tally?.failures ? ` ${tally.steps} 手 崩れ ${failures.length} (既知 ${known})` : ''
        return `${file}${text}${limit ? ` ${limit} 秒で打ち切り` : ''} exit ${code} ${seconds.toFixed(1)} 秒\n`
}

// 親 process。file ごとに子 process を起こす。file でない引数は子に渡す。未知の崩れがあれば exit 1
const _main = async (args) => {
        const files = args.filter((arg) => existsSync(arg))
        const rest = args.filter((arg) => !files.includes(arg))
        let code = 0
        for (const file of files) {
                const result = await launch(file, rest)
                const isUnknown = (result.tally?.failures ?? []).some((failure) => !failure.known)
                process.stdout.write(_line(result))
                code = Math.max(code, result.code, isUnknown ? 1 : 0)
        }
        process.exit(code)
}

process.chdir(_ROOT)

await (process.send ? _load(process.argv[2]) : _main(process.argv.slice(2)))

process.exit(0)
