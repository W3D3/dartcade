import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** SCREENSHOTS_REUSE=1 keeps the stack between runs (and skips the fresh start), for iterating on one shot. */
export const reuse = process.env.SCREENSHOTS_REUSE === '1'

export function compose(args: string): void {
  execSync(`docker compose -f docker-compose.e2e.yaml -f e2e/docker-compose.screenshots.yaml ${args}`, { cwd: root, stdio: 'inherit' })
}
