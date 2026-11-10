import { existsSync, readFileSync } from 'node:fs'
import { registerHooks, stripTypeScriptTypes } from 'node:module'
import { fileURLToPath } from 'node:url'

const _tails = ['.ts', '.tsx', '/index.ts']

const _isBare = (specifier) => /^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$|\.json$|\.wasm$/.test(specifier)

const _find = (specifier, parentURL) => {
        const urls = _tails.map((tail) => new URL(specifier + tail, parentURL))
        return urls.find((url) => existsSync(fileURLToPath(url)))
}

const _resolve = (specifier, context, next) => {
        const isLocal = _isBare(specifier) && context.parentURL?.startsWith('file:')
        if (!isLocal) return next(specifier, context)
        const url = _find(specifier, context.parentURL)
        if (!url) return next(specifier, context)
        return { url: url.href, shortCircuit: true }
}

const _load = (url, context, next) => {
        const isTsx = url.startsWith('file:') && url.endsWith('.tsx')
        if (!isTsx) return next(url, context)
        const code = readFileSync(fileURLToPath(url), 'utf8')
        const source = stripTypeScriptTypes(code, { mode: 'transform' })
        return { format: 'module', source, shortCircuit: true }
}

export const installHook = () => registerHooks({ resolve: _resolve, load: _load })
