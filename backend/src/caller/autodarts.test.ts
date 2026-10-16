import { describe, it, expect } from 'vitest'
import { cutAutodarts, mp3Frames } from './autodarts.js'
import { makeMp3 } from './mp3Fixture.js'

const FRAME = 384
// 100 frames of 24 ms: 2400 ms of audio; the last clip ends at 2390 ms
const sprite = { '1': [0, 500], game_shot: [500, 700], require_2: [1200, 1190] }
const table = (mp3: Uint8Array, o: Record<string, unknown> = {}) => ({
  voice: 'dotty-floor-english',
  mp3: 'dotty-floor-english-Ab12.mp3',
  mp3Bytes: mp3.length,
  unit: 'ms',
  sprite,
  ...o,
})
const firstFrame = (clip: Uint8Array) => clip[4] // the fill byte after the header

describe('mp3Frames', () => {
  it('walks the frames, skipping an ID3 tag and the Info frame, stopping at an ID3v1 TAG', () => {
    const { sampleRate, frames } = mp3Frames(makeMp3({ id3: true, info: true, tag: true }))
    expect(sampleRate).toBe(48000)
    expect(frames).toHaveLength(100)
    expect(frames[0].start).toBe(30 + FRAME)
  })

  it('refuses what is not MPEG-1 Layer III', () => {
    expect(() => mp3Frames(makeMp3({ mpeg2: true }))).toThrow(/Not an Autodarts voice/)
    expect(() => mp3Frames(new Uint8Array(1000))).toThrow(/Not an Autodarts voice/)
  })
})

describe('cutAutodarts', () => {
  it('cuts each clip on frame boundaries, two frames early, rounded outward', () => {
    const mp3 = makeMp3({ info: true })
    const v = cutAutodarts(mp3, table(mp3))
    // "1": 0–500 ms → frames 0..20 (ceil(500 / 24) = 21), no room for a lead-in
    expect(v.clips['1'].length).toBe(21 * FRAME)
    expect(firstFrame(v.clips['1'])).toBe(0)
    // game_shot: 500–1200 ms → frames 20 − 2 = 18 up to 50
    expect(v.clips.gameshot.length).toBe(32 * FRAME)
    expect(firstFrame(v.clips.gameshot)).toBe(18)
    expect(v.clips.require_2.length).toBe((100 - 48) * FRAME)
  })

  it('renames the shots, keeps the rest, names the voice', () => {
    const mp3 = makeMp3()
    const v = cutAutodarts(mp3, table(mp3, { sprite: { ...sprite, game_on: [0, 100], game_shot_match: [100, 100], '0': [200, 100] } }))
    expect(Object.keys(v.clips).sort()).toEqual(['0', '1', 'gameon', 'gameshot', 'matchshot', 'require_2'])
    expect(v).toMatchObject({ name: 'Autodarts Dotty (English)', lang: 'en', total: 6 })
    expect(cutAutodarts(mp3, table(mp3, { voice: 'hware-floor-german' }))).toMatchObject({ name: 'Autodarts Hware (German)', lang: 'de' })
  })

  it('refuses a table for another MP3, timings that do not fit, and malformed tables', () => {
    const mp3 = makeMp3()
    expect(() => cutAutodarts(mp3, table(mp3, { mp3Bytes: mp3.length + 1 }))).toThrow(/different MP3/)
    expect(() => cutAutodarts(mp3, table(mp3, { sprite: { '1': [0, 2000] } }))).toThrow(/timings don't fit/)
    expect(() => cutAutodarts(mp3, table(mp3, { unit: 's' }))).toThrow(/Not an Autodarts voice table/)
    expect(() => cutAutodarts(mp3, table(mp3, { sprite: { '1': [-5, 100] } }))).toThrow(/Not an Autodarts voice table/)
    expect(() => cutAutodarts(mp3, 'nope')).toThrow(/Not an Autodarts voice table/)
  })
})
