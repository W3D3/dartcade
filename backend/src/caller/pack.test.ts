import { describe, it, expect, beforeAll } from 'vitest'
import { isCallerKey, parseTemplate, packName, readPack, keyFromName } from './pack.js'
import { ZipError } from './zip.js'
import { makeZip, deflatedZeros } from './zipFixture.js'

describe('caller keys', () => {
  it('keeps scores, busts, shots, legs, sets, game on and bull off', () => {
    for (const k of ['0', '9', '60', '100', '180', 'busted', 'gameshot', 'matchshot', 'gameon', 'leg_2', 'set_10', 'bulling_start']) expect(isCallerKey(k)).toBe(true)
    for (const k of ['181', '07', 'murmel', 'you_require', 'm20', 'bot level 3', '']) expect(isCallerKey(k)).toBe(false)
  })
})

describe('template CSV', () => {
  it('reads keys per row the way darts-caller does', () => {
    const csv = '﻿0;;\r\n180;;\nGame shot!;gameshot;\n\nLet\'s play!;gameon;matchon;\nmurmel;;\n'
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
    const outer = makeZip([{ name: 'en-GB-Arthur-Male-v4.zip', data: inner }, { name: 'en-GB-v1.csv', data: csv }])
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
      { name: 'voice/180.mp3', data: clip('a') }, { name: 'voice/gameshot.mp3', data: clip('b') },
      { name: 'voice/gameshot+1.mp3', data: clip('c') }, { name: 'voice/murmel.mp3', data: clip('d') },
    ])
    const pack = await readPack(zip, 'voice.zip')
    expect(Object.keys(pack.clips).sort()).toEqual(['180', 'gameshot'])
    expect(pack.clips.gameshot).toHaveLength(2)
  })

  it('ignores junk entries', async () => {
    const zip = makeZip([
      { name: '__MACOSX/voice/._180.mp3', data: clip('junk') }, { name: 'voice/.DS_Store', data: clip('junk') },
      { name: 'voice/readme.txt', data: 'hi' }, { name: 'voice/sub/180.mp3', data: clip('real') },
    ])
    const pack = await readPack(zip, 'voice.zip')
    expect(Object.keys(pack.clips)).toEqual(['180'])
    expect(text(pack.clips['180'][0])).toBe('real')
  })

  it('pairs up to the shorter list when the template and the clips disagree', async () => {
    const zip = makeZip([
      { name: 'p/AM-0_0_mono.mp3', data: clip('zero') }, { name: 'p/AM-1_1_mono.mp3', data: clip('one') },
      { name: 'p/template.csv', data: '0;;\n1;;\n2;;\n3;;\n' },
    ])
    const pack = await readPack(zip, 'p.zip')
    expect(Object.keys(pack.clips).sort()).toEqual(['0', '1'])
  })

  it('keeps only the paired clips when there are more clips than template rows', async () => {
    const zip = makeZip([
      { name: 'p/AM-0_0_mono.mp3', data: clip('zero') }, { name: 'p/AM-1_1_mono.mp3', data: clip('one') },
      { name: 'p/AM-2_2_mono.mp3', data: clip('two') }, { name: 'p/template.csv', data: '0;;\n1;;\n' },
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

  it('rejects a pack whose rows map to no caller key', async () => {
    const zip = makeZip([
      { name: 'p/AM-0_0_mono.mp3', data: clip('a') }, { name: 'p/template.csv', data: 'murmel;;\n' },
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
    beforeAll(async () => { [mib15, mib17] = await Promise.all([deflatedZeros(15), deflatedZeros(17)]) }, 30_000)
    const bomb = (name: string, data: Uint8Array, mib: number) => ({ name, data, deflatedSize: mib * MiB })

    it('refuses a clip over 16 MiB and a template over 16 MiB', async () => {
      await expect(readPack(makeZip([bomb('v/180.mp3', mib17, 17)]), 'v.zip')).rejects.toThrow(new ZipError('That pack unpacks too big'))
      const csv = makeZip([{ name: 'v/AM-0.mp3', data: 'a' }, bomb('v/t.csv', mib17, 17)])
      await expect(readPack(csv, 'v.zip')).rejects.toThrow(new ZipError('That pack unpacks too big'))
    })

    it('keeps all of a pack\'s clips together under 64 MiB', async () => {
      const four = ['0', '1', '2', '3'].map(k => bomb(`v/${k}.mp3`, mib15, 15))
      expect(Object.keys((await readPack(makeZip(four), 'v.zip')).clips)).toHaveLength(4)
      const five = makeZip([...four, bomb('v/4.mp3', mib15, 15)])
      await expect(readPack(five, 'v.zip')).rejects.toThrow(new ZipError('That pack unpacks too big'))
    }, 30_000)
  })
})
