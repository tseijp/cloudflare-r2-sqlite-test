// test/vite.config.ts
import { defineConfig } from 'vite'
import { packages } from '../packages.mjs'

export default defineConfig({
        plugins: [packages()],
})
