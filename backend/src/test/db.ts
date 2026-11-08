// Import this first in a test whose code under test reads the `db` singleton (db/index.ts)
// directly, as requireAdmin does, instead of taking it as a plugin option. Registers the mock
// itself; once the test schema is open, `useDbSingleton(db)` points the singleton at it.
import { vi } from 'vitest'

const dbRef = vi.hoisted<{ current: unknown }>(() => ({ current: undefined }))

vi.mock('../db/index.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../db/index.js')>()
  return {
    ...actual,
    get db() {
      return dbRef.current
    },
  }
})

export const useDbSingleton = (db: unknown) => {
  dbRef.current = db
}
