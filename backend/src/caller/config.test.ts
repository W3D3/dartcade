import { describe, it, expect } from 'vitest'
import { voiceConfig } from './config.js'

const MB = 1024 * 1024

describe('voiceConfig', () => {
  it('reads VOICE_STORAGE_LIMIT_MB, 50 MB by default, 0 for off', () => {
    expect(voiceConfig({})).toEqual({ limitBytes: 50 * MB })
    expect(voiceConfig({ VOICE_STORAGE_LIMIT_MB: '200' })).toEqual({ limitBytes: 200 * MB })
    expect(voiceConfig({ VOICE_STORAGE_LIMIT_MB: '0' })).toEqual({ limitBytes: 0 })
  })

  it('falls back to the default for a value that is not a size', () => {
    for (const v of ['', 'lots', '-5', 'Infinity']) expect(voiceConfig({ VOICE_STORAGE_LIMIT_MB: v })).toEqual({ limitBytes: 50 * MB })
  })
})
