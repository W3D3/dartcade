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
// Each clip opens with its own Info frame (384 bytes here); then the fill byte after a header
const firstFrame = (clip: Uint8Array) => clip[FRAME + 4]
/** A clip's Info frame: its audio frames and the LAME tag's samples a decoder drops at either end. */
function gapless(clip: Uint8Array) {
  const at = 4 + 32 // after the header and the stereo side info
  expect(String.fromCharCode(...clip.subarray(at, at + 4))).toBe('Info')
  const frames = new DataView(clip.buffer, clip.byteOffset).getUint32(at + 8)
  const [a, b, c] = clip.subarray(at + 141, at + 144)
  return { frames, delay: (a << 4) | (b >> 4), padding: ((b & 15) << 8) | c }
}

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
  it('cuts each clip on frame boundaries, three frames early, rounded outward', () => {
    const mp3 = makeMp3({ info: true, delay: 576 })
    const v = cutAutodarts(mp3, table(mp3))
    // The table counts gapless samples; the frames hold them 1105 later (the encoder's 576 delay, the
    // decoder's 529). "1": 0–500 ms → samples 1105–25105 → frames 0..21, no room for a lead-in
    expect(v.clips['1'].length).toBe((1 + 22) * FRAME)
    expect(firstFrame(v.clips['1'])).toBe(0)
    // game_shot: 500–1200 ms → samples 25105–58705 → frame 21 − 3 = 18 up to 50
    expect(v.clips.gameshot.length).toBe((1 + 33) * FRAME)
    expect(firstFrame(v.clips.gameshot)).toBe(18)
    // require_2: frame 50 − 3 = 47 to the end
    expect(v.clips.require_2.length).toBe((1 + 100 - 47) * FRAME)
  })

  it('has decoders drop the lead-in, so a clip starts and ends at its table times (#362)', () => {
    const mp3 = makeMp3({ info: true, delay: 576 })
    const v = cutAutodarts(mp3, table(mp3))
    // What a decoder keeps of a clip cut from frame `first`, in the source's gapless samples
    const kept = (first: number, g: ReturnType<typeof gapless>) => [
      first * 1152 + g.delay + 529 - 1105,
      first * 1152 + g.frames * 1152 - g.padding + 529 - 1105,
    ]
    // game_shot is 500–1200 ms: samples 24000–57600, nothing of the clip before it
    expect(gapless(v.clips.gameshot)).toEqual({ frames: 33, delay: 3840, padding: 576 })
    expect(kept(18, gapless(v.clips.gameshot))).toEqual([24000, 57600])
    expect(kept(0, gapless(v.clips['1']))).toEqual([0, 24000])
    // require_2 runs to the MP3's end, so nothing is padding there
    expect(gapless(v.clips.require_2)).toEqual({ frames: 53, delay: 4032, padding: 0 })
    expect(kept(47, gapless(v.clips.require_2))[0]).toBe(57600)
  })

  it('takes an MP3 without a LAME tag at its raw samples', () => {
    const mp3 = makeMp3()
    const v = cutAutodarts(mp3, table(mp3))
    // game_shot: sample 24000 is in frame 20; from frame 17, the decoder's own 529 aside
    expect(firstFrame(v.clips.gameshot)).toBe(17)
    expect(gapless(v.clips.gameshot).delay).toBe(24000 - 17 * 1152 - 529)
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
