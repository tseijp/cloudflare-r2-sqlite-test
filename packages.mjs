import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const _ROOT = dirname(fileURLToPath(import.meta.url))

const _read = (dir) => {
        const json = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        const entry = typeof json.exports === 'string' ? json.exports : './src/index.ts'
        return { name: json.name, dir, entry: resolve(dir, entry), deps: Object.keys(json.dependencies ?? {}) }
}

const _relative = (to, from) => {
        const path = relative(from, to)
        return path.startsWith('.') ? path : `./${path}`
}

const _closure = (byName, deps, seen = new Set()) => {
        for (const name of deps.filter((dep) => byName.has(dep) && !seen.has(dep))) _closure(byName, byName.get(name).deps, seen.add(name))
        return seen
}

const _pathsOf = (byName, deps, from) => Object.fromEntries([..._closure(byName, deps)].map((name) => [name, [_relative(byName.get(name).entry, from)]]))

const _writeJson = (file, json) => writeFileSync(file, JSON.stringify(json, null, 8) + '\n')

export const scanPackages = (dir = join(_ROOT, 'src')) => {
        const here = existsSync(join(dir, 'package.json')) ? [_read(dir)] : []
        const subs = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== 'node_modules')
        return [...here, ...subs.flatMap((e) => scanPackages(join(dir, e.name)))]
}

export const topPackages = (packages) => packages.filter((pkg) => !packages.some((other) => pkg.dir.startsWith(other.dir + '/')))

const _isMain = process.argv[1] === fileURLToPath(import.meta.url)

if (_isMain) {
        const packages = scanPackages()
        const byName = new Map(packages.map((pkg) => [pkg.name, pkg]))
        const root = JSON.parse(readFileSync(join(_ROOT, 'tsconfig.json'), 'utf8'))
        const typesOf = (dir) => (root.compilerOptions.types ?? []).map((type) => (type.startsWith('.') ? _relative(join(_ROOT, type), dir) : type))
        for (const pkg of packages) _writeJson(join(pkg.dir, 'tsconfig.json'), { extends: _relative(join(_ROOT, 'tsconfig.json'), pkg.dir), compilerOptions: { types: typesOf(pkg.dir), paths: _pathsOf(byName, pkg.deps, pkg.dir) }, include: ['src'] })
        _writeJson(join(_ROOT, 'tsconfig.json'), { ...root, compilerOptions: { ...root.compilerOptions, paths: _pathsOf(byName, topPackages(packages).map((pkg) => pkg.name), _ROOT) } })
        process.stdout.write(`${packages.length} package の tsconfig.json と root の paths を書きました\n`)
}
