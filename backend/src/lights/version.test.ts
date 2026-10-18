import { expect, it } from 'vitest'
import { supportsLights } from './version.js'

it.each([
  ['0.4.0', true],
  ['0.4.1', true],
  ['1.0.0', true],
  ['v0.4.0', true],
  ['dev', true],
  ['dev+abc123-dirty', true],
  ['0.3.1', false],
  ['0.3.9', false],
  [null, false],
  [undefined, false],
  ['', false],
  ['garbage', false],
])('supportsLights(%s) = %s', (v, want) => {
  expect(supportsLights(v)).toBe(want)
})
