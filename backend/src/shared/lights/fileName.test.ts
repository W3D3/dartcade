import { describe, expect, it } from 'vitest'
import { profileFileName } from './index.js'

describe('profileFileName', () => {
  it('names an exported file after the profile, safe for any file system', () => {
    expect(profileFileName('Dartcade default')).toBe('dartcade-default.dartcade-lights.json')
    expect(profileFileName('  ../My "lights"/2  ')).toBe('my-lights-2.dartcade-lights.json')
    expect(profileFileName('💡')).toBe('profile.dartcade-lights.json')
  })
})
