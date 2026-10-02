import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // What dev and prod set too (docker-compose); without it better-auth warns on every app build
    env: { BETTER_AUTH_URL: 'http://localhost:3000' },
  },
})
