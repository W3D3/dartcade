import { configDefaults, defineWorkspace } from 'vitest/config'

// The unit tests (Node, Svelte's server render) and the few that mount a component in a browser-like
// DOM (`*.dom.test.ts`: happy-dom, with Svelte's client runtime, which only the browser condition resolves)
export default defineWorkspace([
  {
    extends: './vite.config.ts',
    test: { name: 'unit', exclude: [...configDefaults.exclude, 'src/**/*.dom.test.ts'] },
  },
  {
    extends: './vite.config.ts',
    resolve: { conditions: ['browser'] },
    test: { name: 'dom', include: ['src/**/*.dom.test.ts'], environment: 'happy-dom' },
  },
])
