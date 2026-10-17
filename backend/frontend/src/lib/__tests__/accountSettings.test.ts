import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { get } from 'svelte/store'
import { accountSettings, loadAccountSettings, OWNER_KEY, writeThrough } from '../accountSettings.js'
import { defaultSettings, loadSettings, saveSettings, SETTINGS_KEY, type GameSettings } from '../gameSettings.js'

function memoryStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

/** A fake API: GET answers with `server`, PUT merges into it and records the body. */
function fakeApi(server: Record<string, unknown> = {}) {
  const puts: Record<string, unknown>[] = []
  const api = {
    GET: vi.fn(() => Promise.resolve({ data: { ...server } })),
    PUT: vi.fn((_path: string, { body }: { body: Record<string, unknown> }) => {
      puts.push(body)
      Object.assign(server, body)
      return Promise.resolve({ data: { ...server } })
    }),
  }
  return { api: api as never, puts, server }
}

const local = (s: Partial<GameSettings>, owner?: string) =>
  memoryStorage({ [SETTINGS_KEY]: JSON.stringify(s), ...(owner ? { [OWNER_KEY]: owner } : {}) })

beforeEach(() => vi.useFakeTimers())
afterEach(async () => {
  await loadAccountSettings(null, null)
  vi.useRealTimers()
})

describe('account settings', () => {
  it('applies the account over the device and keeps per-device ones', async () => {
    const storage = local({ chalkboard: true, volume: 0.2, x01StartScore: 501 }, 'a')
    const { api } = fakeApi({ chalkboard: false, x01StartScore: 301 })
    await loadAccountSettings('a', storage, api)
    expect(get(accountSettings)).toMatchObject({ chalkboard: false, x01StartScore: 301 })
    expect(loadSettings(storage)).toMatchObject({ chalkboard: false, x01StartScore: 301, volume: 0.2 })
  })

  it('writes changed account settings to the account after a moment, never per-device ones', async () => {
    const { api, puts } = fakeApi({ callerOn: false })
    await loadAccountSettings('a', memoryStorage(), api)
    writeThrough({ ...defaultSettings, callerOn: true }, api)
    writeThrough({ ...defaultSettings, callerOn: true, x01FirstTo: 5, volume: 0.1, boardView: 'cam1' }, api)
    expect(puts).toEqual([])
    await vi.runAllTimersAsync()
    expect(puts).toEqual([{ callerOn: true, x01FirstTo: 5 }])
    // Nothing changed since: nothing to send
    writeThrough({ ...defaultSettings, callerOn: true, x01FirstTo: 5 }, api)
    await vi.runAllTimersAsync()
    expect(puts).toHaveLength(1)
  })

  it("moves this device's settings to an account that has none yet", async () => {
    const { api, puts } = fakeApi({})
    await loadAccountSettings('a', local({ visitSum: false, volume: 0.3 }), api)
    await vi.runAllTimersAsync()
    expect(puts).toEqual([{ visitSum: false }])
  })

  it("doesn't carry one account's settings into another's", async () => {
    const storage = local({ visitSum: false, callerVoice: 'pack-a', volume: 0.3 }, 'a')
    const { api, puts } = fakeApi({ chalkboard: false })
    await loadAccountSettings('b', storage, api)
    await vi.runAllTimersAsync()
    expect(get(accountSettings)).toMatchObject({ visitSum: true, callerVoice: null, chalkboard: false })
    expect(loadSettings(storage)).toMatchObject({ visitSum: true, callerVoice: null, volume: 0.3 })
    expect(storage.getItem(OWNER_KEY)).toBe('b')
    expect(puts).toEqual([])
  })

  it('stops writing on sign-out, and drops a write still waiting', async () => {
    const { api, puts } = fakeApi({})
    await loadAccountSettings('a', memoryStorage(), api)
    writeThrough({ ...defaultSettings, soundHit: true }, api)
    await loadAccountSettings(null, null)
    writeThrough({ ...defaultSettings, soundMiss: true }, api)
    await vi.runAllTimersAsync()
    expect(puts).toEqual([])
    expect(get(accountSettings)).toBeNull()
  })

  it('ignores a load that a newer sign-in overtook', async () => {
    let answer: (v: { data: Record<string, unknown> }) => void = () => {}
    const slow = { GET: () => new Promise(r => (answer = r)), PUT: vi.fn() } as never
    const first = loadAccountSettings('a', memoryStorage(), slow)
    await loadAccountSettings('b', memoryStorage(), fakeApi({ chalkboard: false }).api)
    answer({ data: { chalkboard: true } })
    await first
    expect(get(accountSettings)).toMatchObject({ chalkboard: false })
  })

  it('keeps a change when a page applies the account settings again later', async () => {
    const storage = memoryStorage()
    const { api, puts } = fakeApi({ callerOn: false })
    await loadAccountSettings('a', storage, api)
    // Settings turns the caller on: saved on the device and written to the account
    const changed = { ...loadSettings(storage), callerOn: true }
    saveSettings(storage, changed)
    writeThrough(changed, api)
    await vi.runAllTimersAsync()
    // Settings opens again and applies the account's settings over the device's
    const reopened = { ...loadSettings(storage), ...get(accountSettings) }
    expect(reopened.callerOn).toBe(true)
    writeThrough(reopened, api)
    await vi.runAllTimersAsync()
    expect(puts).toEqual([{ callerOn: true }])
  })
})
