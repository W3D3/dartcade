import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export default async function teardown() {
  console.log('[e2e] Tearing down test environment...')
  execSync('docker compose -f docker-compose.e2e.yaml down -v', {
    cwd: root,
    stdio: 'inherit',
  })
}
