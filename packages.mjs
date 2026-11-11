import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const _ROOT = dirname(fileURLToPath(import.meta.url))

const _ROOTS = ['src', 'test']

const _TEST = join(_ROOT, 'test')

const _GROUPS = ['declarative', 'procedural']

const _dirs = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== 'node_modules').map((e) => join(dir, e.name)) : [])

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

const _children = (dir) => _dirs(join(dir, 'packages')).flatMap((sub) => (_GROUPS.includes(basename(sub)) ? _dirs(sub) : [sub]))

const _tree = (dir, shares = []) => {
        const kids = _children(dir)
        const below = [...shares, ...kids.filter((kid) => basename(kid) === 'share')]
        return [{ dir, deps: [...shares, ...kids].filter((dep) => dep !== dir) }, ...kids.flatMap((kid) => _tree(kid, below))]
}

const _nameOf = (dir) => {
        const parts = relative(_TEST, dir).split('/')
        return `@test/${parts.filter((part) => !['db', 'packages', ..._GROUPS].includes(part)).join('-')}`
}

const _entryOf = (dir) => (existsSync(join(dir, 'src', 'index.tsx')) ? './src/index.tsx' : './src/index.ts')

const _derive = ({ dir, deps }) => {
        const entry = join(dir, _entryOf(dir))
        const dependencies = Object.fromEntries(deps.map((dep) => [_nameOf(dep), 'workspace:*']))
        _writeJson(join(dir, 'package.json'), { name: _nameOf(dir), private: true, type: 'module', exports: _entryOf(dir), dependencies })
        if (existsSync(entry)) return
        mkdirSync(dirname(entry), { recursive: true })
        writeFileSync(entry, 'export {}\n')
}

const _scan = (dir) => {
        const here = existsSync(join(dir, 'package.json')) ? [_read(dir)] : []
        return [...here, ..._dirs(dir).flatMap((sub) => _scan(sub))]
}

export const scanPackages = () => _ROOTS.flatMap((root) => _scan(join(_ROOT, root)))

export const topPackages = (packages) => packages.filter((pkg) => !packages.some((other) => pkg.dir.startsWith(other.dir + '/')))

export const packages = () => {
        const _all = scanPackages()
        const _byName = new Map(_all.map((pkg) => [pkg.name, pkg]))
        const _app = { name: 'package の外の file', deps: topPackages(_all).map((pkg) => pkg.name) }
        const _ownerOf = (file) => _all.filter((pkg) => file.startsWith(pkg.dir + '/')).sort((a, b) => b.dir.length - a.dir.length)[0]
        return {
                name: 'packages',
                enforce: 'pre',
                resolveId(id, importer) {
                        const owner = importer ? _ownerOf(importer) : undefined
                        const target = _byName.get(id)
                        const isRelative = !!importer && id.startsWith('.')
                        const reached = isRelative ? _ownerOf(resolve(importer, '..', id)) : undefined
                        if (target && !(owner ?? _app).deps.includes(id)) return this.error(`${(owner ?? _app).name} の dependencies に ${id} がありません`)
                        if (target) return target.entry
                        if (reached && reached !== owner) return this.error(`${importer} から ${reached.name} の中へ相対 path で import しています。${reached.name} を package 名で import してください`)
                        return null
                },
        }
}

const _isMain = process.argv[1] === fileURLToPath(import.meta.url)

if (_isMain) {
        const tops = _dirs(_TEST).map((side) => join(side, 'db'))
        for (const pkg of tops.filter((dir) => existsSync(dir)).flatMap((dir) => _tree(dir))) _derive(pkg)
        const all = scanPackages()
        const byName = new Map(all.map((pkg) => [pkg.name, pkg]))
        const root = JSON.parse(readFileSync(join(_ROOT, 'tsconfig.json'), 'utf8'))
        const typesOf = (dir) => (root.compilerOptions.types ?? []).map((type) => (type.startsWith('.') ? _relative(join(_ROOT, type), dir) : type))
        for (const pkg of all) _writeJson(join(pkg.dir, 'tsconfig.json'), { extends: _relative(join(_ROOT, 'tsconfig.json'), pkg.dir), compilerOptions: { types: typesOf(pkg.dir), paths: _pathsOf(byName, pkg.deps, pkg.dir) }, include: ['src'] })
        _writeJson(join(_ROOT, 'tsconfig.json'), {
                ...root,
                compilerOptions: {
                        ...root.compilerOptions,
                        paths: _pathsOf(
                                byName,
                                topPackages(all).map((pkg) => pkg.name),
                                _ROOT,
                        ),
                },
        })
        process.stdout.write(`${all.length} package の tsconfig.json と root の paths を書きました\n`)
}
