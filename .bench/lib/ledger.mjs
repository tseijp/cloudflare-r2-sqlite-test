import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const readLatest = (dir) => {
        if (!existsSync(dir)) return null
        const files = readdirSync(dir)
                .filter((f) => f.endsWith('.json'))
                .sort()
        if (files.length === 0) return null
        const latest = files[files.length - 1]
        return { file: join(dir, latest), ...JSON.parse(readFileSync(join(dir, latest), 'utf8')) }
}

const uniquePath = (dir, at) => {
        let file = join(dir, `${at}.json`)
        let n = 1
        while (existsSync(file)) file = join(dir, `${at}-${++n}.json`)
        return file
}

export const writeLedger = (dir, ledger) => {
        mkdirSync(dir, { recursive: true })
        const file = uniquePath(dir, ledger.at)
        writeFileSync(file, JSON.stringify(ledger, null, 2) + '\n', { flag: 'wx' })
        return file
}

export const summaryOf = (ledger, previous) => {
        const axes = Object.entries(ledger.axes).map(([k, a]) => `${k} ${a.points}/${a.max}`)
        const gates = Object.keys(ledger.gates).filter((k) => ledger.gates[k])
        const diff = previous ? `previous ${previous.score} at ${previous.at}` : 'no previous ledger'
        return `score ${ledger.score} (${diff}); ${axes.join(', ')}; gates ${gates.join(', ') || 'none'}`
}
