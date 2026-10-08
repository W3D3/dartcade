import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

// The style step calls Vite's `preprocessCSS` against a config it re-resolves itself (not the
// running server's), which crashes under Vitest's SSR module graph on Vite 6 ("Cannot create
// proxy with a non-object as target or handler") for any component with a plain `<style>` block
// — layerchart's included. Dev and production builds never hit this (Vite's own `configResolved`
// patches the preprocessor with the real config before it's used there), so the workaround is
// scoped to Vitest's own process (`process.env.VITEST`, set by Vitest itself) rather than
// disabling style preprocessing everywhere.
export default {
  preprocess: vitePreprocess(process.env.VITEST ? { style: false } : undefined),
}
