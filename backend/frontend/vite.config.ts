import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const backendHost = process.env.BACKEND_HOST ?? 'localhost'
// Hostnames besides localhost the dev server answers to, comma-separated (see .env.example)
const allowedHosts = (process.env.VITE_ALLOWED_HOSTS ?? '').split(',').map(h => h.trim()).filter(Boolean)

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib'),
    },
  },
  server: {
    allowedHosts,
    proxy: {
      '/api': { target: `http://${backendHost}:3000`, changeOrigin: true },
      '/ws': { target: `ws://${backendHost}:3000`, ws: true },
      '/bridge': { target: `ws://${backendHost}:3000`, ws: true },
    },
  },
  build: { outDir: 'dist' },
})
