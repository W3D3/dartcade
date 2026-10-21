import { describe, it, expect } from 'vitest'
import { invalidatedNote } from './invalidated'

describe('invalidatedNote', () => {
  it('says the game stays in the history but does not count', () => {
    expect(invalidatedNote(null).text).toMatch(/does not count in your stats or ratings/)
  })

  it('carries the contact email when the deployment has one, none otherwise', () => {
    expect(invalidatedNote('hi@x.org').email).toBe('hi@x.org')
    expect(invalidatedNote(null).email).toBeNull()
  })
})
