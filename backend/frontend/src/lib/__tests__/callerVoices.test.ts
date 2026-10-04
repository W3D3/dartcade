import { describe, it, expect } from 'vitest'
import { builtinClipUrls, clipUrl, importErrorText, keptText, mergeClips, packClipUrls, sampleKey, storageUse } from '../caller/voices.js'

const MiB = 1024 * 1024
const sha = 'a'.repeat(64)

describe('clip URLs', () => {
  it('fetches a pack clip by its hash', () => {
    expect(clipUrl(sha)).toBe(`/api/voice-clips/${sha}`)
    expect(packClipUrls({ '180': [sha] })).toEqual({ '180': [`/api/voice-clips/${sha}`] })
  })

  it('finds a built-in clip next to its manifest', () => {
    expect(builtinClipUrls('en-adam', { gameshot: ['game shot.mp3', 'gs2.mp3'] }))
      .toEqual({ gameshot: ['/voices/en-adam/game%20shot.mp3', '/voices/en-adam/gs2.mp3'] })
  })
})

describe('mergeClips', () => {
  it('keeps the pack\'s clips and fills missing keys from the built-in voice', () => {
    const pack = { '180': ['/p/180'], gameshot: ['/p/gs'] }
    const base = { '180': ['/b/180'], busted: ['/b/bust'] }
    expect(mergeClips(pack, base)).toEqual({ '180': ['/p/180'], gameshot: ['/p/gs'], busted: ['/b/bust'] })
  })
})

describe('storageUse', () => {
  it('says how much of the limit the voices use, in MB', () => {
    const u = storageUse({ bytes: 2.6 * MiB, limitBytes: 50 * MiB })
    expect(`${u.used} of ${u.limit} MB`).toBe('2.6 of 50 MB')
    expect(u.left).toBe('47.4')
    expect(u.percent).toBeCloseTo(5.2)
  })

  it('shows a sliver for a tiny pack and none for nothing', () => {
    expect(storageUse({ bytes: 2000, limitBytes: 50 * MiB })).toMatchObject({ used: '<0.1', percent: 1 })
    expect(storageUse({ bytes: 0, limitBytes: 50 * MiB })).toMatchObject({ used: '0', left: '50', percent: 0 })
  })

  it('stays within the bar when over the limit or with imports off', () => {
    expect(storageUse({ bytes: 60 * MiB, limitBytes: 50 * MiB })).toMatchObject({ left: '0', percent: 100 })
    expect(storageUse({ bytes: 0, limitBytes: 0 }).percent).toBe(0)
  })
})

describe('import results', () => {
  it('says how many of the source\'s clips were kept', () => {
    expect(keptText({ clips: 385, total: 12422 })).toBe('Kept 385 of 12,422 clips')
  })

  it('shows the server\'s error, or one for the status when it sent none', () => {
    expect(importErrorText(413, { error: 'Voice storage limit reached' })).toBe('Voice storage limit reached')
    expect(importErrorText(413, null)).toBe('The zip is too large.')
    expect(importErrorText(0, null)).toMatch(/connection/)
    expect(importErrorText(500, 'oops')).toBe('The import failed (500). Try again.')
  })
})

describe('sampleKey', () => {
  it('plays 180 if the pack has it, else a score, else anything it has', () => {
    expect(sampleKey({ gameshot: ['x'], '180': ['y'], '60': ['z'] })).toBe('180')
    expect(sampleKey({ gameshot: ['x'], '60': ['z'] })).toBe('60')
    expect(sampleKey({ gameshot: ['x'] })).toBe('gameshot')
    expect(sampleKey({})).toBeNull()
  })
})
