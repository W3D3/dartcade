import { describe, it, expect } from 'vitest'
import { PALETTE } from '$lib/details/chartColors'
import {
  changedCellText,
  compareFeatures,
  featureColor,
  featureDepth,
  featureOf,
  featureTree,
  flagName,
  inFeature,
  topFeature,
  defaultLabel,
  draftFromFlag,
  draftToRequest,
  flagMode,
  flagNumber,
  flagSourceText,
  flagStateText,
  flagUsers,
  flagValueText,
  isDirty,
  isValid,
  modeBody,
  numberDefault,
  numberDraftError,
  overrideLine,
  type AdminFlag,
  type FlagDraft,
} from './flags'

function booleanFlag(overrides: Partial<AdminFlag> = {}): AdminFlag {
  return {
    key: 'gamemode.minigolf.enabled',
    kind: 'boolean',
    description: 'Minigolf',
    default: { rule: 'admins', envOn: false },
    override: null,
    value: false,
    ...overrides,
  }
}

function numberFlag(overrides: Partial<AdminFlag> = {}): AdminFlag {
  return {
    key: 'matchmaking.visitSeconds',
    kind: 'number',
    description: 'Visit time limit',
    range: [10, 300],
    default: { value: 60 },
    override: null,
    value: 60,
    ...overrides,
  }
}

describe('flagMode', () => {
  it('is default with no stored override', () => {
    expect(flagMode(booleanFlag())).toBe('default')
  })

  it('is the stored override mode', () => {
    expect(flagMode(booleanFlag({ override: { mode: 'users', users: [], updatedBy: null, updatedAt: '2026-01-01T00:00:00.000Z' } }))).toBe(
      'users',
    )
  })
})

describe('defaultLabel', () => {
  it('names the rule when FLAGS_ON is off for this deployment', () => {
    expect(defaultLabel(booleanFlag({ default: { rule: 'admins', envOn: false } }))).toBe('Default (admins)')
    expect(defaultLabel(booleanFlag({ default: { rule: 'nobody', envOn: false } }))).toBe('Default (off)')
  })

  it('is everyone once FLAGS_ON turns it on for this deployment', () => {
    expect(defaultLabel(booleanFlag({ default: { rule: 'admins', envOn: true } }))).toBe('Default (everyone)')
  })
})

describe('flagUsers', () => {
  it('is empty with no stored override', () => {
    expect(flagUsers(booleanFlag())).toEqual([])
  })

  it("is the override's chosen users, including a deleted one", () => {
    const users = [
      { id: 'u1', name: 'Alex' },
      { id: 'u2', name: null },
    ]
    expect(flagUsers(booleanFlag({ override: { mode: 'users', users, updatedBy: null, updatedAt: '2026-01-01T00:00:00.000Z' } }))).toEqual(
      users,
    )
  })
})

describe('flagNumber', () => {
  it('is the stored override when there is one', () => {
    expect(numberFlag({ override: { number: 90, updatedBy: null, updatedAt: '2026-01-01T00:00:00.000Z' } }).override?.number).toBe(90)
    expect(flagNumber(numberFlag({ override: { number: 90, updatedBy: null, updatedAt: '2026-01-01T00:00:00.000Z' } }))).toBe(90)
  })

  it('falls back to the deployment value, then the code default', () => {
    expect(flagNumber(numberFlag({ default: { value: 60, envValue: 45 } }))).toBe(45)
    expect(flagNumber(numberFlag({ default: { value: 60 } }))).toBe(60)
  })
})

describe('numberDefault', () => {
  it('is the deployment value, else the code default, ignoring an override', () => {
    const override = { number: 90, updatedBy: null, updatedAt: '2026-01-01T00:00:00.000Z' }
    expect(numberDefault(numberFlag({ default: { value: 60, envValue: 45 }, override }))).toBe(45)
    expect(numberDefault(numberFlag({ default: { value: 60 }, override }))).toBe(60)
  })
})

describe('overrideLine', () => {
  const now = new Date('2026-01-01T00:10:00.000Z')

  it('is null without a stored override', () => {
    expect(overrideLine(booleanFlag(), now)).toBeNull()
  })

  it('names who changed it and when', () => {
    const flag = booleanFlag({
      override: { mode: 'on', updatedBy: { id: 'u1', name: 'Alex' }, updatedAt: '2026-01-01T00:05:00.000Z' },
    })
    expect(overrideLine(flag, now)).toBe('Changed by Alex, 5 min ago')
  })

  it("shows a deleted account as 'Deleted user'", () => {
    const flag = booleanFlag({
      override: { mode: 'on', updatedBy: { id: 'u1', name: null }, updatedAt: '2026-01-01T00:05:00.000Z' },
    })
    expect(overrideLine(flag, now)).toBe('Changed by Deleted user, 5 min ago')
  })
})

describe('changedCellText', () => {
  const now = new Date('2026-01-01T00:10:00.000Z')

  it('is "—" without a stored override', () => {
    expect(changedCellText(booleanFlag(), now)).toBe('—')
  })

  it('is compact: no "Changed by" prefix (the column header already says that)', () => {
    const flag = booleanFlag({
      override: { mode: 'on', updatedBy: { id: 'u1', name: 'Alex' }, updatedAt: '2026-01-01T00:05:00.000Z' },
    })
    expect(changedCellText(flag, now)).toBe('Alex · 5 min ago')
  })
})

describe('modeBody', () => {
  it('carries userIds only for mode users', () => {
    expect(modeBody('off', [])).toEqual({ mode: 'off' })
    expect(modeBody('users', ['u1', 'u2'])).toEqual({ mode: 'users', userIds: ['u1', 'u2'] })
  })
})

describe('flagValueText', () => {
  it('is On/Off for a boolean flag', () => {
    expect(flagValueText(booleanFlag({ value: true }))).toBe('On')
    expect(flagValueText(booleanFlag({ value: false }))).toBe('Off')
  })

  it('adds a unit guessed from the key, for a number flag', () => {
    expect(flagValueText(numberFlag({ value: 90 }))).toBe('90s')
    expect(flagValueText({ ...numberFlag({ value: 50 }), key: 'some.sharePercent' })).toBe('50%')
    expect(flagValueText({ ...numberFlag({ value: 3 }), key: 'some.plainCount' })).toBe('3')
  })
})

describe('flagStateText', () => {
  it("names who a boolean flag's on for", () => {
    expect(flagStateText(booleanFlag({ override: { mode: 'on', updatedBy: null, updatedAt: '2026-01-01T00:00:00.000Z' } }))).toBe(
      'Everyone',
    )
    expect(flagStateText(booleanFlag({ override: { mode: 'off', updatedBy: null, updatedAt: '2026-01-01T00:00:00.000Z' } }))).toBe('Off')
    expect(flagStateText(booleanFlag({ override: { mode: 'admins', updatedBy: null, updatedAt: '2026-01-01T00:00:00.000Z' } }))).toBe(
      'Admins',
    )
  })

  it('counts the chosen users', () => {
    const users = [{ id: 'u1', name: 'Alex' }]
    expect(flagStateText(booleanFlag({ override: { mode: 'users', users, updatedBy: null, updatedAt: '2026-01-01T00:00:00.000Z' } }))).toBe(
      'Chosen users · 1',
    )
  })

  it('falls back to the default label with no override', () => {
    expect(flagStateText(booleanFlag({ default: { rule: 'admins', envOn: false } }))).toBe('Default (admins)')
  })

  it("is a number flag's value, same as flagValueText", () => {
    const flag = numberFlag({ value: 45 })
    expect(flagStateText(flag)).toBe(flagValueText(flag))
  })
})

describe('flagSourceText', () => {
  it('is Override once a flag has one, whatever the kind or default', () => {
    const override = { mode: 'on' as const, updatedBy: null, updatedAt: '2026-01-01T00:00:00.000Z' }
    expect(flagSourceText(booleanFlag({ override }))).toBe('Override')
    expect(flagSourceText(numberFlag({ override: { number: 90, updatedBy: null, updatedAt: '2026-01-01T00:00:00.000Z' } }))).toBe(
      'Override',
    )
  })

  it('names FLAGS_ON for a boolean flag turned on for this deployment', () => {
    expect(flagSourceText(booleanFlag({ default: { rule: 'admins', envOn: true } }))).toBe('FLAGS_ON')
  })

  it('names FLAG_VALUES for a number flag set for this deployment', () => {
    expect(flagSourceText(numberFlag({ default: { value: 60, envValue: 45 } }))).toBe('FLAG_VALUES')
  })

  it("is Rule otherwise: just the flag's own default", () => {
    expect(flagSourceText(booleanFlag({ default: { rule: 'admins', envOn: false } }))).toBe('Rule')
    expect(flagSourceText(numberFlag({ default: { value: 60 } }))).toBe('Rule')
  })
})

describe('draftFromFlag', () => {
  it('is default/no users for a boolean flag with no override', () => {
    expect(draftFromFlag(booleanFlag())).toEqual({ kind: 'boolean', mode: 'default', userIds: [] })
  })

  it("is the stored mode and users for a boolean flag's override", () => {
    const users = [{ id: 'u1', name: 'Alex' }]
    const flag = booleanFlag({ override: { mode: 'users', users, updatedBy: null, updatedAt: '2026-01-01T00:00:00.000Z' } })
    expect(draftFromFlag(flag)).toEqual({ kind: 'boolean', mode: 'users', userIds: ['u1'] })
  })

  it('is the default number, marked default, with no override', () => {
    expect(draftFromFlag(numberFlag({ default: { value: 60 } }))).toEqual({ kind: 'number', isDefault: true, number: 60 })
  })

  it("is the stored number, not default, for a number flag's override", () => {
    const flag = numberFlag({ override: { number: 90, updatedBy: null, updatedAt: '2026-01-01T00:00:00.000Z' } })
    expect(draftFromFlag(flag)).toEqual({ kind: 'number', isDefault: false, number: 90 })
  })
})

describe('isDirty', () => {
  it('is false when the draft matches the flag as-is', () => {
    const flag = booleanFlag()
    expect(isDirty(flag, draftFromFlag(flag))).toBe(false)
  })

  it('is true when the mode changed', () => {
    const flag = booleanFlag()
    expect(isDirty(flag, { kind: 'boolean', mode: 'on', userIds: [] })).toBe(true)
  })

  it("is false when the 'users' draft has the same ids in a different order", () => {
    const users = [
      { id: 'u1', name: 'Alex' },
      { id: 'u2', name: 'Sam' },
    ]
    const flag = booleanFlag({ override: { mode: 'users', users, updatedBy: null, updatedAt: '2026-01-01T00:00:00.000Z' } })
    expect(isDirty(flag, { kind: 'boolean', mode: 'users', userIds: ['u2', 'u1'] })).toBe(false)
  })

  it('is true when a chosen user was added or removed', () => {
    const users = [{ id: 'u1', name: 'Alex' }]
    const flag = booleanFlag({ override: { mode: 'users', users, updatedBy: null, updatedAt: '2026-01-01T00:00:00.000Z' } })
    expect(isDirty(flag, { kind: 'boolean', mode: 'users', userIds: ['u1', 'u2'] })).toBe(true)
    expect(isDirty(flag, { kind: 'boolean', mode: 'users', userIds: [] })).toBe(true)
  })

  it('is false for a number draft left at default', () => {
    const flag = numberFlag({ default: { value: 60 } })
    expect(isDirty(flag, { kind: 'number', isDefault: true, number: 999 })).toBe(false)
  })

  it('is true when the number value changed', () => {
    const flag = numberFlag({ default: { value: 60 } })
    expect(isDirty(flag, { kind: 'number', isDefault: false, number: 90 })).toBe(true)
  })
})

describe('numberDraftError', () => {
  const flag = numberFlag({ range: [10, 300] })

  it('flags a non-finite value', () => {
    expect(numberDraftError(flag, NaN)).toBe('Enter a number')
  })

  it('flags a value outside the range', () => {
    expect(numberDraftError(flag, 5)).toMatch(/10.*300/)
    expect(numberDraftError(flag, 400)).toMatch(/10.*300/)
  })

  it('is null in range', () => {
    expect(numberDraftError(flag, 60)).toBeNull()
  })
})

describe('isValid', () => {
  it("is false for a 'users' draft with no chosen users", () => {
    expect(isValid(booleanFlag(), { kind: 'boolean', mode: 'users', userIds: [] })).toBe(false)
    expect(isValid(booleanFlag(), { kind: 'boolean', mode: 'users', userIds: ['u1'] })).toBe(true)
  })

  it('is true for every other boolean mode', () => {
    expect(isValid(booleanFlag(), { kind: 'boolean', mode: 'on', userIds: [] })).toBe(true)
  })

  it('is true for a default number draft regardless of its stale number', () => {
    expect(isValid(numberFlag({ range: [10, 300] }), { kind: 'number', isDefault: true, number: 999 })).toBe(true)
  })

  it('is false for a non-default number draft outside the range', () => {
    expect(isValid(numberFlag({ range: [10, 300] }), { kind: 'number', isDefault: false, number: 999 })).toBe(false)
  })

  it('is true for a non-default number draft in range', () => {
    expect(isValid(numberFlag({ range: [10, 300] }), { kind: 'number', isDefault: false, number: 90 })).toBe(true)
  })
})

describe('draftToRequest', () => {
  it("is 'delete' for a default boolean draft", () => {
    expect(draftToRequest({ kind: 'boolean', mode: 'default', userIds: [] })).toEqual({ kind: 'delete' })
  })

  it('is a PUT mode body for a non-default boolean draft', () => {
    expect(draftToRequest({ kind: 'boolean', mode: 'off', userIds: [] })).toEqual({ kind: 'mode', mode: 'off', userIds: [] })
    expect(draftToRequest({ kind: 'boolean', mode: 'users', userIds: ['u1'] })).toEqual({
      kind: 'mode',
      mode: 'users',
      userIds: ['u1'],
    })
  })

  it("is 'delete' for a default number draft", () => {
    const draft: FlagDraft = { kind: 'number', isDefault: true, number: 123 }
    expect(draftToRequest(draft)).toEqual({ kind: 'delete' })
  })

  it('is a PUT number body for a non-default number draft', () => {
    expect(draftToRequest({ kind: 'number', isDefault: false, number: 90 })).toEqual({ kind: 'number', number: 90 })
  })
})

describe('features from flag keys', () => {
  it('featureOf drops the last segment; a key without a dot is its own feature', () => {
    expect(featureOf('gamemode.minigolf.enabled')).toBe('gamemode.minigolf')
    expect(featureOf('matchmaking.visitSeconds')).toBe('matchmaking')
    expect(featureOf('caller.autodartsImport')).toBe('caller')
    expect(featureOf('beta')).toBe('beta')
  })

  it('flagName is the last segment, topFeature the first', () => {
    expect(flagName('gamemode.minigolf.enabled')).toBe('enabled')
    expect(flagName('beta')).toBe('beta')
    expect(topFeature('gamemode.minigolf.enabled')).toBe('gamemode')
    expect(topFeature('beta')).toBe('beta')
  })

  it('featureTree adds every parent once and sorts parents right before their children', () => {
    const keys = [
      'matchmaking.visitSeconds',
      'gamemode.minigolf.enabled',
      'gamemode.minigolf.flat',
      'gamemode-x.enabled',
      'caller.autodartsImport',
      'gamemode.hilo.enabled',
      'matchmaking.enabled',
      'beta',
    ]
    expect(featureTree(keys)).toEqual(['beta', 'caller', 'gamemode', 'gamemode.hilo', 'gamemode.minigolf', 'gamemode-x', 'matchmaking'])
    expect(featureTree([])).toEqual([])
  })

  it('featureTree includes intermediate parents that hold no flag of their own', () => {
    expect(featureTree(['a.b.c.d'])).toEqual(['a', 'a.b', 'a.b.c'])
    expect(featureDepth('a')).toBe(0)
    expect(featureDepth('a.b.c')).toBe(2)
  })

  it('compareFeatures orders by segment, a parent before its children', () => {
    expect(compareFeatures('gamemode', 'gamemode.hilo')).toBeLessThan(0)
    expect(compareFeatures('gamemode.hilo', 'gamemode-x')).toBeLessThan(0)
    expect(compareFeatures('caller', 'caller')).toBe(0)
  })

  it('inFeature matches the feature and its sub-features on dot boundaries only', () => {
    expect(inFeature('gamemode.minigolf.enabled', 'gamemode')).toBe(true)
    expect(inFeature('gamemode.minigolf.enabled', 'gamemode.minigolf')).toBe(true)
    expect(inFeature('gamemode.minigolf.enabled', 'game')).toBe(false)
    expect(inFeature('gamemode.minigolf.enabled', 'gamemode.mini')).toBe(false)
    expect(inFeature('gamemode.hilo.enabled', 'gamemode.minigolf')).toBe(false)
    // The flag's own last segment isn't a feature
    expect(inFeature('gamemode.minigolf.enabled', 'gamemode.minigolf.enabled')).toBe(false)
    expect(inFeature('beta', 'beta')).toBe(true)
  })

  it('featureColor is a palette colour, the same for every feature under one top-level feature', () => {
    expect(PALETTE).toContain(featureColor('gamemode'))
    expect(featureColor('gamemode.minigolf')).toBe(featureColor('gamemode'))
    expect(featureColor('gamemode.hilo')).toBe(featureColor('gamemode'))
    // Today's three top-level features tell apart
    expect(new Set(['gamemode', 'matchmaking', 'caller'].map(featureColor)).size).toBe(3)
  })
})
