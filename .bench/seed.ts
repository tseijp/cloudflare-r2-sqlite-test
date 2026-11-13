// seed の範囲を探索する。scenario の書き出し、実行、縮め、台帳までを行う
// node .bench/run.mjs .bench/seed.ts <from>-<to> [steps] [shrink]
import { closeSync, openSync } from 'node:fs'
import * as db from '@db/server'
import { createGen } from '@test/client'
import { launch } from './launch.mjs'

// 同時に走らせる scenario の数と、この探索全体を打ち切るまでの秒
const _LANES = 3

const _LIMIT = 3000

// scenario の先頭の行。手で書いた scenario と同じく、製品と検証を結ぶ .bench/sim.ts を import する
const _HEAD = "import { a, b, csv, db, t } from '../sim.ts'"

const { createDb: _createDb, ...limits } = db

const [from, to = from] = (process.argv[3] ?? '1').split('-').map(Number)

// 省いた設定は @test/client の既定値になる。steps は準備の後の命令の数、shrink は縮めるときの試行の上限
const names = ['steps', 'shrink']

const given = process.argv.slice(4).map((text, index) => [names[index], Number(text)])

const settings = Object.fromEntries(given)

const seeds = Array.from({ length: to - from + 1 }, (_, index) => from + index)

// 書き出す file。seed から作った scenario と試行は消してよい .bench/out、縮めた scenario は .bench/fails
const places = (seed: number) => {
        const name = String(seed).padStart(6, '0')
        const [file, trial] = [`.bench/out/seed-${name}.ts`, `.bench/out/trial-${name}-`]
        return { file, trial, fail: `.bench/fails/${name}.ts` }
}

// scenario の file を子 process で走らせる。出力は file の隣の .log に残す
const send = async (file: string) => {
        const log = openSync(file.replace(/\.ts$/, '.log'), 'w')
        const result = await launch(file, [], log)
        closeSync(log)
        return result
}

const lanes = Array.from({ length: _LANES }, () => createGen({ send }))

const started = Date.now()

const explore = async (seed: number, lane: number) => {
        const run = await lanes[lane].run({ type: 'explore', seed, head: _HEAD, ...places(seed), ...settings })
        const failures = run.tally?.failures ?? []
        const known = failures.filter((failure) => failure.known).length
        const text = run.tally ? `${run.tally.steps} 手 崩れ ${failures.length} (既知 ${known})` : `exit ${run.code}`
        process.stdout.write(`seed ${seed} ${text} ${run.seconds.toFixed(1)} 秒 ${run.fail || run.file}\n`)
}

const sweep = async (lane: number) => {
        for (const seed of seeds.filter((_, index) => index % _LANES === lane)) await explore(seed, lane)
}

process.send?.({ limit: _LIMIT })

await Promise.all(lanes.map((_, lane) => sweep(lane)))

const at = new Date().toISOString()

await lanes[0].run({
        type: 'ledger',
        file: `.bench/out/${at}.json`,
        at,
        seeds: `${from}-${to}`,
        seconds: Math.round((Date.now() - started) / 1000),
        limits,
        settings,
        runs: lanes.flatMap((lane) => lane.stat().runs),
})

process.stdout.write(`台帳 .bench/out/${at}.json\n`)

export default null
