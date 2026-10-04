import { Ajv } from 'ajv'
import addFormatsModule from 'ajv-formats'
import lobbySchema from '../schema/lobby-ws-v1.deref.json' with { type: 'json' }
import type { FriendsMessage, LobbyServerMessage, MeMessage } from '../schema/lobby-ws.js'

// ajv-formats is CommonJS: see session/snapshotValidation.ts
const addFormats = addFormatsModule.default

const ajv = new Ajv({ strict: false, allErrors: true })
addFormats(ajv)
const validateLobby = ajv.compile(lobbySchema.$defs.LobbyServerMessage)
const validateMe = ajv.compile(lobbySchema.$defs.MeMessage)
const validateFriends = ajv.compile(lobbySchema.$defs.FriendsMessage)

/**
 * Dev/test check of a pushed lobby or /ws/me message against schema/lobby-ws-v1.json.
 * Throws in tests (drift fails CI); logs in development.
 */
export function checkLobbyMessage(msg: LobbyServerMessage | MeMessage | FriendsMessage, log: (message: string) => void): void {
  if (process.env.NODE_ENV === 'production') return
  const validate = msg.type === 'me' ? validateMe : msg.type === 'friends' ? validateFriends : validateLobby
  if (validate(msg)) return
  const message = `${msg.type} message does not match schema/lobby-ws-v1.json: ${ajv.errorsText(validate.errors)}`
  if (process.env.NODE_ENV === 'test') throw new Error(message)
  log(message)
}
