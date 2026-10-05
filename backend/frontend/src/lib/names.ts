// Names are handles (backend src/users/names.ts): instant hints while typing, then the server's
// availability check. The server decides; this only saves round trips for obvious mistakes.
import { writable, type Readable } from 'svelte/store'
import { api } from './api'

export const NAME_RULE = '2–20 letters, digits, . _ or -, no spaces'
const ALLOWED = /^[\p{L}\p{Nd}._-]+$/u

export const normalizeName = (raw: string): string => raw.trim().normalize('NFC')

/** What's wrong with a name, as a hint under the field; null when it follows the rules. */
export function nameHint(raw: string): string | null {
  const name = normalizeName(raw)
  const length = Array.from(name).length
  if (/\s/u.test(name)) return 'No spaces: try a . or _ instead'
  if (length < 2) return 'At least 2 characters'
  if (length > 20) return '20 characters at most'
  if (!ALLOWED.test(name)) return 'Only letters, digits, . _ and -'
  return null
}

export type NameStatus =
  | { kind: 'empty' }
  | { kind: 'invalid'; hint: string }
  | { kind: 'checking' }
  | { kind: 'available'; name: string; own: boolean }
  | { kind: 'taken'; name: string }
  /** The check failed (offline): sending is allowed, the server checks again. */
  | { kind: 'unknown' }

export type NameLookup = (name: string) => Promise<{ available: boolean; reason?: 'taken' | 'invalid' } | null>

export const lookupName: NameLookup = async name => {
  const { data } = await api.GET('/api/users/name-available', { params: { query: { name } } })
  return data ?? null
}

/** Checks a name as it's typed: the rules at once, availability after `delay` ms of quiet. Only the latest answer counts. */
export function createNameCheck(lookup: NameLookup, own: () => string | null, delay = 300) {
  const status = writable<NameStatus>({ kind: 'empty' })
  let timer: ReturnType<typeof setTimeout> | undefined
  let latest = 0

  function check(raw: string): void {
    clearTimeout(timer)
    const ask = ++latest
    const name = normalizeName(raw)
    if (name === '') {
      status.set({ kind: 'empty' })
      return
    }
    const hint = nameHint(name)
    if (hint) {
      status.set({ kind: 'invalid', hint })
      return
    }
    if (own() === name) {
      status.set({ kind: 'available', name, own: true })
      return
    }
    status.set({ kind: 'checking' })
    timer = setTimeout(() => {
      lookup(name).then(
        r => {
          if (ask !== latest) return
          if (!r) status.set({ kind: 'unknown' })
          else if (r.available) status.set({ kind: 'available', name, own: false })
          else if (r.reason === 'taken') status.set({ kind: 'taken', name })
          else status.set({ kind: 'invalid', hint: NAME_RULE })
        },
        () => {
          if (ask === latest) status.set({ kind: 'unknown' })
        },
      )
    }, delay)
  }

  return {
    status: { subscribe: status.subscribe } satisfies Readable<NameStatus>,
    check,
    stop() {
      clearTimeout(timer)
      latest++
    },
  }
}

/** The line under the name field. */
export function nameStatusText(s: NameStatus): string {
  switch (s.kind) {
    case 'empty':
      return NAME_RULE
    case 'invalid':
      return s.hint
    case 'checking':
      return 'Checking…'
    case 'available':
      return s.own ? "That's your name" : `@${s.name} is free`
    case 'taken':
      return `@${s.name} is taken`
    case 'unknown':
      return "Couldn't check the name right now"
  }
}

export const nameSendable = (s: NameStatus): boolean => s.kind === 'available' || s.kind === 'unknown'
