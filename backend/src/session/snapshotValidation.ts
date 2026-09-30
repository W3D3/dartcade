import { Ajv } from 'ajv'
import addFormatsDefault from 'ajv-formats'
import type { FormatsPlugin } from 'ajv-formats'
import wsSchema from '../schema/game-ws-v1.deref.json' with { type: 'json' }
import type { Snapshot } from './types.js'

// ajv-formats has only a default export; under this project's NodeNext module resolution,
// TypeScript resolves `import addFormats from 'ajv-formats'` to the module namespace (not
// callable) rather than its default export, so we re-type it explicitly from the import type.
const addFormats = addFormatsDefault as unknown as FormatsPlugin

const ajv = new Ajv({ strict: false, allErrors: true })
addFormats(ajv)
const validate = ajv.compile(wsSchema.$defs.Snapshot)

/**
 * Dev/test check of a snapshot against schema/game-ws-v1.json before it is sent.
 * Throws in tests (drift fails CI); logs in development (a local game keeps running).
 */
export function checkSnapshot(snap: Snapshot, log: (msg: string) => void): void {
  if (process.env.NODE_ENV === 'production' || validate(snap)) return
  const message = `snapshot does not match schema/game-ws-v1.json: ${ajv.errorsText(validate.errors)}`
  if (process.env.NODE_ENV === 'test') throw new Error(message)
  log(message)
}
