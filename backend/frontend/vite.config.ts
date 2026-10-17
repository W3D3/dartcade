import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const backendHost = process.env.BACKEND_HOST ?? 'localhost'
// Hostnames besides localhost the dev server answers to, comma-separated (see .env.example)
const allowedHosts = (process.env.VITE_ALLOWED_HOSTS ?? '')
  .split(',')
  .map(h => h.trim())
  .filter(Boolean)

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  resolve: {
    alias: [
      { find: '$lib', replacement: path.resolve('./src/lib') },
      { find: '$shared', replacement: path.resolve('../src/shared') },
      // What its "svelte" export condition points at: Vitest's own Vite resolves without that condition
      { find: /^svelte-spa-router$/, replacement: path.resolve('./node_modules/svelte-spa-router/Router.svelte') },
    ],
    // $shared/minigolf imports Rapier, polyclip-ts and zod, but $shared sits outside this package (and outside /app in
    // the dev container and the Docker build): resolve them from here, where they're installed too
    dedupe: ['@dimforge/rapier3d-deterministic-compat', 'polyclip-ts', 'zod'],
  },
  server: {
    fs: { allow: [path.resolve('..')] },
    allowedHosts,
    proxy: {
      '/api': { target: `http://${backendHost}:3000`, changeOrigin: true },
      '/ofrep': { target: `http://${backendHost}:3000`, changeOrigin: true },
      '/ws': { target: `ws://${backendHost}:3000`, ws: true },
      '/bridge': { target: `ws://${backendHost}:3000`, ws: true },
    },
  },
  build: { outDir: 'dist' },
})
