import { warn } from './log.js'

/** Runs `job` every `ms` (not keeping the process alive); a failure is logged as `<name> failed`, never thrown. Returns the timer for `clearInterval`. */
export function every(ms: number, name: string, job: () => Promise<unknown>): NodeJS.Timeout {
  return setInterval(() => {
    job().catch((err: unknown) => {
      warn(`${name} failed`, { error: String(err) })
    })
  }, ms).unref()
}
