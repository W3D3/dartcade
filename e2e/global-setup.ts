import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export default async function setup() {
  // Verify Docker Compose v2
  try {
    execSync('docker compose version', { encoding: 'utf8', stdio: 'pipe' })
  } catch {
    throw new Error('Docker Compose v2 is required. Run: docker compose version')
  }

  console.log('[e2e] Starting test environment...')
  execSync('docker compose -f docker-compose.e2e.yaml up -d --wait', {
    cwd: root,
    stdio: 'inherit',
  })
  console.log('[e2e] Test environment ready.')
}
