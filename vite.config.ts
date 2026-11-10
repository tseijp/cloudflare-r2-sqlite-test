// vite.config.ts
import { resolve } from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { scanPackages, topPackages } from './packages.mjs'
import type { Plugin } from 'vite'

const _packages = (): Plugin => {
        const _all = scanPackages()
        const _byName = new Map(_all.map((pkg) => [pkg.name, pkg]))
        const _app = { name: 'src 直下のアプリ', deps: topPackages(_all).map((pkg) => pkg.name) }
        const _ownerOf = (file: string) => _all.filter((pkg) => file.startsWith(pkg.dir + '/')).sort((a, b) => b.dir.length - a.dir.length)[0]
        return {
                name: 'packages',
                enforce: 'pre',
                resolveId(id, importer) {
                        const owner = importer ? _ownerOf(importer) : undefined
                        const target = _byName.get(id)
                        const isRelative = !!importer && id.startsWith('.')
                        const reached = isRelative ? _ownerOf(resolve(importer!, '..', id)) : undefined
                        if (target && !(owner ?? _app).deps.includes(id)) return this.error(`${(owner ?? _app).name} の dependencies に ${id} がありません`)
                        if (target) return target.entry
                        if (reached && reached !== owner) return this.error(`${importer} から ${reached.name} の中へ相対 path で import しています。${reached.name} を package 名で import してください`)
                        return null
                },
        }
}

export default defineConfig({
        plugins: [_packages(), cloudflare(), react(), tailwindcss()],
})
