// The 2019-09 build: game-ws-v1.json uses unevaluatedProperties, which the default draft-07 Ajv ignores
import { Ajv2019 } from 'ajv/dist/2019.js'
import addFormatsModule from 'ajv-formats'
import wsSchema from '../schema/game-ws-v1.deref.json' with { type: 'json' }
import type { Snapshot } from './types.js'

// ajv-formats is CommonJS: under NodeNext, TypeScript types its default import as the
// module object, whose `default` is the plugin (at runtime module.exports.default is the
// plugin itself too).
const addFormats = addFormatsModule.default

const ajv = new Ajv2019({ strict: false, allErrors: true })
addFormats(ajv)
const validate = ajv.compile(wsSchema.$defs.Snapshot)

/**
 * Dev/test check of a snapshot against schema/game-ws-v1.json before it is sent.
 * Throws in tests (drift fails CI); logs in development (a local game keeps running).
 */
export function checkSnapshot(snap: Snapshot, log: (msg: string) => void): void {
  // Checked as unknown: ajv's type guard would otherwise narrow `snap` to never when it fails
  const data: unknown = snap
  if (process.env.NODE_ENV === 'production' || validate(data)) return
  const message = `snapshot of game ${snap.sessionId} (${snap.gameId}) does not match schema/game-ws-v1.json: ${ajv.errorsText(validate.errors)}`
  if (process.env.NODE_ENV === 'test') throw new Error(message)
  log(message)
}
