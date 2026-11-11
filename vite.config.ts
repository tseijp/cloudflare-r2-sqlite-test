// vite.config.ts
import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { packages } from './packages.mjs'

export default defineConfig({
        plugins: [packages(), cloudflare(), react(), tailwindcss()],
})
