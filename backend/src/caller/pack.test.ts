import { describe, it, expect, beforeAll } from 'vitest'
import { isCallerKey, parseTemplate, packName, readPack, keyFromName } from './pack.js'
import { ZipError } from './zip.js'
import { makeZip, deflatedZeros } from './zipFixture.js'
import { makeMp3 } from './mp3Fixture.js'

describe('caller keys', () => {
  it('keeps scores, busts, shots, legs, sets, game on, bull off and "and"', () => {
    for (const k of ['0', '9', '60', '100', '180', 'busted', 'gameshot', 'matchshot', 'gameon', 'leg_2', 'set_10', 'bulling_start', 'and'])
      expect(isCallerKey(k)).toBe(true)
    for (const k of ['181', '07', 'murmel', 'm20', 'bot level 3', '']) expect(isCallerKey(k)).toBe(false)
  })

  it('takes checkout calls: require_1 to require_180 and the you_require lead-in', () => {
    for (const k of ['require_1', 'require_121', 'require_180', 'you_require']) expect(isCallerKey(k)).toBe(true)
    for (const k of ['require_0', 'require_181', 'require_07', 'require_']) expect(isCallerKey(k)).toBe(false)
    expect(keyFromName('you require.mp3')).toBe('you_require')
    expect(keyFromName('You-Require+2.mp3')).toBe('you_require')
  })
})

describe('template CSV', () => {
  it('reads keys per row the way darts-caller does', () => {
    const csv = "﻿0;;\r\n180;;\nGame shot!;gameshot;\n\nLet's play!;gameon;matchon;\nmurmel;;\n"
    expect(parseTemplate(csv)).toEqual([['0'], ['180'], ['gameshot'], [], ['gameon', 'matchon'], ['murmel']])
  })
})

describe('pack name', () => {
  it('reads language, speaker and gender from the file name', () => {
    expect(packName('en-GB-Arthur-Male-v4.zip')).toEqual({ name: 'en-GB Arthur (Male)', lang: 'en-GB' })
    expect(packName('de-DE-Chirp3-HD-Puck-MALE.zip')).toEqual({ name: 'de-DE Chirp3 HD Puck (Male)', lang: 'de-DE' })
    expect(packName('my voices.zip')).toEqual({ name: 'my voices', lang: null })
    expect(packName('en-GB-ash-MALE-v2.zip')).toEqual({ name: 'en-GB ash (Male)', lang: 'en-GB' })
  })
})

describe('keyFromName', () => {
  it('normalises the way Tools for Autodarts and darts-caller name files', () => {
    expect(keyFromName('voice/180.mp3')).toBe('180')
    expect(keyFromName('GameShot+2.MP3')).toBe('gameshot')
    expect(keyFromName('bulling-start.wav')).toBe('bulling_start')
    expect(keyFromName('game on.mp3')).toBe('gameon')
  })

  it('folds spelled-out shots to their keys', () => {
    expect(keyFromName('game-shot.mp3')).toBe('gameshot')
    expect(keyFromName('Game_Shot+1.mp3')).toBe('gameshot')
    expect(keyFromName('game-on.wav')).toBe('gameon')
    expect(keyFromName('match shot.mp3')).toBe('matchshot')
    expect(keyFromName('bulling_start.mp3')).toBe('bulling_start')
  })
})

const clip = (s: string) => new TextEncoder().encode(s)
const text = (c: { bytes: Uint8Array }) => new TextDecoder().decode(c.bytes)

describe('readPack', () => {
  it('reads the darts-caller download: a zip with the clips zip and the template', async () => {
    const inner = makeZip([
      { name: 'en-GB-Arthur-Male-v4/', data: '', method: 0 },
      { name: 'en-GB-Arthur-Male-v4/AM-00002_2_mono.mp3', data: clip('gs-a') },
      { name: 'en-GB-Arthur-Male-v4/AM-00000_0_mono.mp3', data: clip('zero') },
      { name: 'en-GB-Arthur-Male-v4/AM-00001_1_mono.mp3', data: clip('one-eighty') },
      { name: 'en-GB-Arthur-Male-v4/AM-00003_3_mono.mp3', data: clip('gs-b') },
      { name: 'en-GB-Arthur-Male-v4/AM-00004_4_mono.mp3', data: clip('murmel') },
    ])
    const csv = '0;;\n180;;\nGame shot!;gameshot;\nGameshot!;gameshot;\nmurmel;;\n'
    const outer = makeZip([
      { name: 'en-GB-Arthur-Male-v4.zip', data: inner },
      { name: 'en-GB-v1.csv', data: csv },
    ])
    const pack = await readPack(outer, 'en-GB-Arthur-Male-v4.zip')
    expect(pack.name).toBe('en-GB Arthur (Male)')
    expect(Object.keys(pack.clips).sort()).toEqual(['0', '180', 'gameshot'])
    expect(text(pack.clips['180'][0])).toBe('one-eighty')
    expect(pack.clips.gameshot.map(text)).toEqual(['gs-a', 'gs-b'])
    expect(pack.clips['0'][0].mime).toBe('audio/mpeg')
    expect(pack.total).toBe(5)
  })

  it('reads a folder of clips named by key (an installed darts-caller pack)', async () => {
    const zip = makeZip([
      { name: 'voice/180.mp3', data: clip('a') },
      { name: 'voice/gameshot.mp3', data: clip('b') },
      { name: 'voice/gameshot+1.mp3', data: clip('c') },
      { name: 'voice/murmel.mp3', data: clip('d') },
    ])
    const pack = await readPack(zip, 'voice.zip')
    expect(Object.keys(pack.clips).sort()).toEqual(['180', 'gameshot'])
    expect(pack.clips.gameshot).toHaveLength(2)
  })

  it('ignores junk entries', async () => {
    const zip = makeZip([
      { name: '__MACOSX/voice/._180.mp3', data: clip('junk') },
      { name: 'voice/.DS_Store', data: clip('junk') },
      { name: 'voice/readme.txt', data: 'hi' },
      { name: 'voice/sub/180.mp3', data: clip('real') },
    ])
    const pack = await readPack(zip, 'voice.zip')
    expect(Object.keys(pack.clips)).toEqual(['180'])
    expect(text(pack.clips['180'][0])).toBe('real')
  })

  it('pairs up to the shorter list when the template and the clips disagree', async () => {
    const zip = makeZip([
      { name: 'p/AM-0_0_mono.mp3', data: clip('zero') },
      { name: 'p/AM-1_1_mono.mp3', data: clip('one') },
      { name: 'p/template.csv', data: '0;;\n1;;\n2;;\n3;;\n' },
    ])
    const pack = await readPack(zip, 'p.zip')
    expect(Object.keys(pack.clips).sort()).toEqual(['0', '1'])
  })

  it('keeps only the paired clips when there are more clips than template rows', async () => {
    const zip = makeZip([
      { name: 'p/AM-0_0_mono.mp3', data: clip('zero') },
      { name: 'p/AM-1_1_mono.mp3', data: clip('one') },
      { name: 'p/AM-2_2_mono.mp3', data: clip('two') },
      { name: 'p/template.csv', data: '0;;\n1;;\n' },
    ])
    const pack = await readPack(zip, 'p.zip')
    expect(Object.keys(pack.clips).sort()).toEqual(['0', '1'])
    expect(pack.total).toBe(3)
  })

  it('gives a .wav clip the wav mime type', async () => {
    const zip = makeZip([{ name: 'voice/180.wav', data: clip('a') }])
    const pack = await readPack(zip, 'voice.zip')
    expect(pack.clips['180'][0].mime).toBe('audio/wav')
  })

  it('gives an .ogg clip the ogg mime type', async () => {
    const zip = makeZip([{ name: 'voice/busted.OGG', data: clip('a') }])
    const pack = await readPack(zip, 'voice.zip')
    expect(pack.clips.busted[0].mime).toBe('audio/ogg')
  })

  it('rejects a pack whose rows map to no caller key', async () => {
    const zip = makeZip([
      { name: 'p/AM-0_0_mono.mp3', data: clip('a') },
      { name: 'p/template.csv', data: 'murmel;;\n' },
    ])
    await expect(readPack(zip, 'p.zip')).rejects.toThrow(new ZipError('No caller clips in this pack'))
  })

  it('says what is wrong with something that is not a pack', async () => {
    await expect(readPack(new TextEncoder().encode('nope'), 'x.zip')).rejects.toThrow('Not a zip file')
    await expect(readPack(makeZip([{ name: 'a.txt', data: 'a' }]), 'x.zip')).rejects.toThrow('No sound files found')
  })

  describe('size limits', () => {
    const MiB = 1024 * 1024
    let mib15: Uint8Array
    let mib17: Uint8Array
    beforeAll(async () => {
      ;[mib15, mib17] = await Promise.all([deflatedZeros(15), deflatedZeros(17)])
    }, 30_000)
    const bomb = (name: string, data: Uint8Array, mib: number) => ({ name, data, deflatedSize: mib * MiB })

    it('refuses a clip over 16 MiB and a template over 16 MiB', async () => {
      await expect(readPack(makeZip([bomb('v/180.mp3', mib17, 17)]), 'v.zip')).rejects.toThrow(new ZipError('That pack unpacks too big'))
      const csv = makeZip([{ name: 'v/AM-0.mp3', data: 'a' }, bomb('v/t.csv', mib17, 17)])
      await expect(readPack(csv, 'v.zip')).rejects.toThrow(new ZipError('That pack unpacks too big'))
    })

    it("keeps all of a pack's clips together under 64 MiB", async () => {
      const four = ['0', '1', '2', '3'].map(k => bomb(`v/${k}.mp3`, mib15, 15))
      expect(Object.keys((await readPack(makeZip(four), 'v.zip')).clips)).toHaveLength(4)
      const five = makeZip([...four, bomb('v/4.mp3', mib15, 15)])
      await expect(readPack(five, 'v.zip')).rejects.toThrow(new ZipError('That pack unpacks too big'))
    }, 30_000)
  })
})

describe('readPack: Autodarts voices', () => {
  const mp3 = makeMp3()
  const json = JSON.stringify({
    voice: 'dotty-floor-english',
    mp3: 'dotty-floor-english-Ab12.mp3',
    mp3Bytes: mp3.length,
    unit: 'ms',
    sprite: { '1': [0, 500], game_shot: [500, 700], require_2: [1200, 1190], murmel: [100, 100] },
  })
  const zip = makeZip([
    { name: 'dotty-floor-english-Ab12.mp3', data: mp3, method: 0 },
    { name: 'dotty-floor-english-Ab12.json', data: json },
  ])

  it('cuts the MP3 by its table when Autodarts imports are on', async () => {
    const pack = await readPack(zip, 'dotty-floor-english-Ab12.zip', { autodarts: true })
    expect(pack).toMatchObject({ name: 'Autodarts Dotty (English)', lang: 'en', total: 4 })
    expect(Object.keys(pack.clips).sort()).toEqual(['1', 'gameshot', 'require_2'])
    expect(pack.clips.gameshot[0].mime).toBe('audio/mpeg')
  })

  it('reads it as an ordinary pack when they are off (and finds no clips)', async () => {
    await expect(readPack(zip, 'dotty-floor-english-Ab12.zip')).rejects.toThrow('No caller clips in this pack')
  })

  it('a pack with a .json and several clips is an ordinary pack', async () => {
    const pack = await readPack(
      makeZip([
        { name: '180.mp3', data: 'a' },
        { name: 'gameshot.mp3', data: 'b' },
        { name: 'notes.json', data: '{}' },
      ]),
      'mine.zip',
      { autodarts: true },
    )
    expect(Object.keys(pack.clips).sort()).toEqual(['180', 'gameshot'])
  })

  it('a clip with a .json that is no table is an ordinary pack', async () => {
    for (const notes of ['{"author":"me"}', 'not json']) {
      const pack = await readPack(
        makeZip([
          { name: '180.mp3', data: 'a' },
          { name: 'info.json', data: notes },
        ]),
        'mine.zip',
        { autodarts: true },
      )
      expect(Object.keys(pack.clips)).toEqual(['180'])
    }
  })

  it('still refuses a table that does not fit its MP3', async () => {
    const wrong = makeZip([
      { name: 'v.mp3', data: mp3, method: 0 },
      { name: 'v.json', data: JSON.stringify({ ...JSON.parse(json), mp3Bytes: mp3.length + 1 }) },
    ])
    await expect(readPack(wrong, 'v.zip', { autodarts: true })).rejects.toThrow('This table belongs to a different MP3')
  })

  it('refuses a table whose clips together unpack over 64 MiB', async () => {
    // 400 caller clips, each the whole 12 s (192 kB) MP3: 77 MB
    const big = makeMp3({ frames: 500 })
    const keys = [
      ...Array.from({ length: 181 }, (_, n) => String(n)),
      ...Array.from({ length: 180 }, (_, n) => `require_${n + 1}`),
      ...Array.from({ length: 39 }, (_, n) => `leg_${n + 1}`),
    ]
    const table = {
      voice: 'dotty-floor-english',
      mp3: 'v.mp3',
      mp3Bytes: big.length,
      unit: 'ms',
      sprite: Object.fromEntries(keys.map(k => [k, [0, 12000]])),
    }
    const bomb = makeZip([
      { name: 'v.mp3', data: big, method: 0 },
      { name: 'v.json', data: JSON.stringify(table) },
    ])
    await expect(readPack(bomb, 'v.zip', { autodarts: true })).rejects.toThrow(new ZipError('That pack unpacks too big'))
  })
})
