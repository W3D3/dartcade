import { randomInt } from 'crypto'

/** No I, L, O, 0 or 1: nothing to mix up when reading a code aloud or off a screen. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

/** A new lobby code, shown as K7Q4-MD (the client adds the dash). */
export function newLobbyCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}
