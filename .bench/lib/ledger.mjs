import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

export const FORMAT = 'bench/2'

const _REFERENCE = /\.bench\/|\.bench['"`]|bench\/run|run\.mjs/

const _files = (dir) =>
        readdirSync(dir, { withFileTypes: true })
                .sort((a, b) => (a.name < b.name ? -1 : 1))
                .flatMap((e) => (e.isDirectory() ? _files(join(dir, e.name)) : [join(dir, e.name)]))

export const hashOf = (root, paths) => {
        const hash = createHash('sha256')
        for (const path of paths) hash.update(relative(root, path) + '\0').update(readFileSync(path)).update('\0')
        return hash.digest('hex')
}

export const runnerFiles = (bench) => [
        join(bench, 'run.mjs'),
        ..._files(join(bench, 'lib')).filter((p) => p.endsWith('.mjs')),
]

export const srcFiles = (root) => _files(join(root, 'src'))

export const referencesOf = (root) =>
        srcFiles(root)
                .filter((path) => _REFERENCE.test(readFileSync(path, 'utf8')))
                .map((path) => relative(root, path))

const _previous = (out) => {
        if (!existsSync(out)) return null
        const names = readdirSync(out).filter((n) => n.endsWith('.json')).sort()
        const last = names.at(-1)
        if (!last) return null
        const json = JSON.parse(readFileSync(join(out, last), 'utf8'))
        return json.format === FORMAT ? { name: last, json } : { name: last, json: null }
}

const _diffLine = (prev, next) => {
        if (!prev) return '前回の台帳なし'
        if (!prev.json) return `前回の台帳 ${prev.name} は旧 runner の形式で式が違うため比べない`
        const axes = Object.keys(next.axes)
                .map((k) => [k, next.axes[k].score - (prev.json.axes?.[k]?.score ?? 0)])
                .filter(([, d]) => d !== 0)
                .map(([k, d]) => `${k} ${d > 0 ? '+' : ''}${d}`)
        const gates = next.gates.filter((g) => !g.ok).map((g) => g.name).join('・') || 'なし'
        const tail = axes.length ? ' (' + axes.join(', ') + ')' : ''
        return `前回 ${prev.name} から score ${prev.json.score} → ${next.score}${tail}、落ちた gate: ${gates}`
}

export const writeLedger = (out, ledger) => {
        mkdirSync(out, { recursive: true })
        const prev = _previous(out)
        const diff = _diffLine(prev, ledger)
        const path = join(out, ledger.at + '.json')
        writeFileSync(path, JSON.stringify({ ...ledger, diff }, null, 2) + '\n')
        return { path, diff }
}
