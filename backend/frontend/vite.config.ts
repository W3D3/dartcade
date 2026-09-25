import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

const backendHost = process.env.BACKEND_HOST ?? 'localhost'

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  server: {
    proxy: {
      '/api': { target: `http://${backendHost}:3000`, changeOrigin: true },
      '/ws': { target: `ws://${backendHost}:3000`, ws: true },
      '/bridge': { target: `ws://${backendHost}:3000`, ws: true },
    },
  },
  build: { outDir: 'dist' },
})
