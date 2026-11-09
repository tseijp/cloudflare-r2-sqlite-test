import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

export const listFiles = (dir) => {
        const out = []
        const walk = (d) => {
                for (const name of readdirSync(d).sort()) {
                        const p = join(d, name)
                        if (statSync(p).isDirectory()) walk(p)
                        if (statSync(p).isFile()) out.push(p)
                }
        }
        walk(dir)
        return out
}

export const hashFiles = (root, files) => {
        const h = createHash('sha256')
        for (const f of [...files].sort()) {
                h.update(relative(root, f))
                h.update('\0')
                h.update(readFileSync(f))
                h.update('\0')
        }
        return h.digest('hex')
}

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
