import { describe, it, expect } from 'vitest'
import { normalizePairingCode, formatPairingCode, extractPairingCode } from '../pairing'

describe('normalizePairingCode', () => {
  it('uppercases and keeps only code characters', () => {
    expect(normalizePairingCode('7kq4m2xd')).toBe('7KQ4M2XD')
  })

  it('strips dashes and spaces', () => {
    expect(normalizePairingCode(' 7kq4-m2xd ')).toBe('7KQ4M2XD')
  })

  it('drops characters outside the charset', () => {
    // O, I, 0, 1 are confusables excluded from the charset (K stays)
    expect(normalizePairingCode('7KO4-I2X1')).toBe('7K42X')
  })

  it('caps at 8 characters', () => {
    expect(normalizePairingCode('7KQ4M2XDEXTRA')).toBe('7KQ4M2XD')
  })
})

describe('formatPairingCode', () => {
  it('inserts a dash between the two groups', () => {
    expect(formatPairingCode('7KQ4M2XD')).toBe('7KQ4-M2XD')
  })

  it('leaves a short partial code ungrouped', () => {
    expect(formatPairingCode('7KQ')).toBe('7KQ')
  })

  it('groups as soon as there is a fifth character', () => {
    expect(formatPairingCode('7KQ4M')).toBe('7KQ4-M')
  })
})

describe('extractPairingCode', () => {
  it('extracts a bare code', () => {
    expect(extractPairingCode('7kq4m2xd')).toBe('7KQ4M2XD')
  })

  it('extracts a dashed code', () => {
    expect(extractPairingCode('7KQ4-M2XD')).toBe('7KQ4M2XD')
  })

  it('extracts from a whole log line with a dash', () => {
    expect(extractPairingCode('Pairing code 7KQ4-M2XD · new code every 10 min')).toBe('7KQ4M2XD')
  })

  it('extracts a solid 8-char code from a log line', () => {
    expect(extractPairingCode('enter: 7KQ4M2XD to pair')).toBe('7KQ4M2XD')
  })
})
