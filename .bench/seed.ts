import { mkdirSync, writeFileSync } from 'node:fs'
import { explore, print } from '@db/test'
import { K, fixtures, sim } from './sim.ts'
import type { Report, Step } from '@db/test'

const [_seed = '0', _steps = '60', _mode = ''] = process.argv.slice(4)

const _play = (steps: Step[], title: string): Promise<Report> => sim({ title }).play(steps)

const _keyOf = (report: Report) => report.fails.filter((fail) => !fail.known).map((fail) => `${fail.axis}/${fail.note.split('。')[0]}`)[0] ?? ''

const _shrink = async (steps: Step[], key: string) => {
        let kept = steps
        for (let at = kept.length - 1, budget = 40; at >= 1 && budget > 0; at--, budget--) {
                const trial = kept.filter((_, index) => index !== at)
                if (_keyOf(await _play(trial, 'shrink')) === key) kept = trial
        }
        return kept
}

const { region, steps } = explore({ seed: Number(_seed), steps: Number(_steps), fixtures: await fixtures(), K })

const _title = `seed ${_seed}: ${region.use} / ${region.event} / size ${region.size} / delta ${region.deltas}`

const _report = await _play(steps, _title)

const _key = _keyOf(_report)

const _file = _key ? `.bench/fails/${_seed.padStart(6, '0')}.ts` : `.bench/out/seed-${_seed}.ts`

const _kept = _key && _mode === 'shrink' ? await _shrink(steps, _key) : steps

mkdirSync(new URL('./out/', import.meta.url), { recursive: true })

mkdirSync(new URL('./fails/', import.meta.url), { recursive: true })

writeFileSync(new URL(`../${_file}`, import.meta.url), print(_kept, `${_title}${_key ? ` / ${_key}` : ''}`))

export default { ..._report, seed: Number(_seed), region: { use: region.use, event: region.event, size: region.size }, file: _file, K }
