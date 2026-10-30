import { get, writable } from 'svelte/store'
import { api as defaultApi } from './api/client.js'
import { defaultSettings, loadSettings, parseSettings, saveSettings, type GameSettings } from './gameSettings.js'

/**
 * The settings that follow the account to every board and device: the ones on Settings' Game
 * preferences and Caller sections. Everything else (volume, the match screen's board and input
 * view, minigolf's aim dial) stays on each device. A match's game settings drawer changes the
 * same switches on that device only; Settings writes them to the account.
 */
export const ACCOUNT_KEYS = [
  'checkoutSuggestions',
  'visitSum',
  'chalkboard',
  'showMarkers',
  'soundHit',
  'soundTreble',
  'trebleAbove',
  'soundMiss',
  'soundSwitch',
  'soundBust',
  'soundPack',
  'callerOn',
  'callerVoice',
  'callerCheckouts',
  'callerCheckoutRepeat',
  'x01StartScore',
  'x01OutMode',
  'x01FirstTo',
  'x01BullOff',
] as const satisfies readonly (keyof GameSettings)[]
export type AccountSettings = Pick<GameSettings, (typeof ACCOUNT_KEYS)[number]>

/** Whose account settings the device's cache holds, so another account doesn't inherit them. */
export const OWNER_KEY = 'dartcade_settings_owner'
const WRITE_DELAY_MS = 500

type Api = Pick<typeof defaultApi, 'GET' | 'PUT'>
type Store = Pick<Storage, 'getItem' | 'setItem'>

export const accountPart = (s: GameSettings): AccountSettings => ({
  checkoutSuggestions: s.checkoutSuggestions,
  visitSum: s.visitSum,
  chalkboard: s.chalkboard,
  showMarkers: s.showMarkers,
  soundHit: s.soundHit,
  soundTreble: s.soundTreble,
  trebleAbove: s.trebleAbove,
  soundMiss: s.soundMiss,
  soundSwitch: s.soundSwitch,
  soundBust: s.soundBust,
  soundPack: s.soundPack,
  callerOn: s.callerOn,
  callerVoice: s.callerVoice,
  callerCheckouts: s.callerCheckouts,
  callerCheckoutRepeat: s.callerCheckoutRepeat,
  x01StartScore: s.x01StartScore,
  x01OutMode: s.x01OutMode,
  x01FirstTo: s.x01FirstTo,
  x01BullOff: s.x01BullOff,
})

function copy(to: Partial<AccountSettings>, from: AccountSettings, key: keyof AccountSettings): void {
  Object.assign(to, { [key]: from[key] })
}

/** The signed-in account's settings, set when loaded and on every write; pages apply them over theirs. */
export const accountSettings = writable<AccountSettings | null>(null)

// What the server holds for the signed-in user (defaults for the keys never set)
let synced: { userId: string; values: AccountSettings } | null = null
let loadingFor: string | null = null
let latest: GameSettings | null = null
let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Loads the account's settings after sign-in (or a switch of user) and applies them over the
 * device's cache; null signs out. Settings the device has but the account hasn't set yet (the
 * per-device settings from before) are written to the account, unless they belong to another account.
 */
export async function loadAccountSettings(userId: string | null, storage: Store | null, api: Api = defaultApi): Promise<void> {
  clearTimeout(timer)
  synced = null
  latest = null
  loadingFor = userId
  accountSettings.set(null)
  if (!userId) return
  const { data } = await api.GET('/api/me/preferences')
  if (!data || loadingFor !== userId) return
  const local = loadSettings(storage)
  const owner = storage?.getItem(OWNER_KEY) ?? null
  const base = owner === null || owner === userId ? local : { ...local, ...accountPart(defaultSettings) }
  const merged = parseSettings({ ...base, ...data })
  saveSettings(storage, merged)
  try {
    storage?.setItem(OWNER_KEY, userId)
  } catch {
    // Storage blocked: the next load starts from the defaults again
  }
  synced = { userId, values: accountPart(parseSettings(data)) }
  accountSettings.set(accountPart(merged))
  writeThrough(merged, api)
}

/** Writes the account settings that changed to the account, a moment after the last change. */
export function writeThrough(s: GameSettings, api: Api = defaultApi): void {
  if (!synced) return
  latest = s
  // Keep the store current, so a page opened later doesn't apply stale values over the change
  const now = accountPart(s)
  const shown = get(accountSettings)
  if (!shown || ACCOUNT_KEYS.some(k => shown[k] !== now[k])) accountSettings.set(now)
  clearTimeout(timer)
  timer = setTimeout(() => void flush(api), WRITE_DELAY_MS)
}

async function flush(api: Api): Promise<void> {
  const target = synced
  if (!target || !latest) return
  const now = accountPart(latest)
  const changes: Partial<AccountSettings> = {}
  for (const k of ACCOUNT_KEYS) if (now[k] !== target.values[k]) copy(changes, now, k)
  if (Object.keys(changes).length === 0) return
  const { data } = await api.PUT('/api/me/preferences', { body: changes })
  // A failed write is sent again with the next change; a switch of user drops it
  if (data && synced === target) target.values = accountPart(parseSettings(data))
}
