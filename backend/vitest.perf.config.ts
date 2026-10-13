import { defineConfig } from 'vitest/config'

// Benchmarks only (`npm run test:perf`), kept out of `npm test`: timings flake under the parallel suite
export default defineConfig({ test: { environment: 'node', include: ['src/**/*.perf.test.ts'] } })
