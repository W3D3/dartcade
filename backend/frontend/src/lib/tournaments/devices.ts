// Venue devices of an in-person tournament (tournament mode): the organizer adds one (a one-time
// code, shown once), opens the code on the device, which then holds a scoped session cookie. The
// server decides what that session may do; this is the calls and the words for them.
import { writable } from 'svelte/store'
import { api } from '$lib/api'
import { quietApi } from '$lib/api/client'
import type { components } from '$lib/api/schema'
import { hrefs } from '$lib/routes'

export type TournamentDevice = components['schemas']['TournamentDevice']
export type DeviceSession = components['schemas']['TournamentDeviceSession']
export type Pairing = components['schemas']['TournamentDevicePairing']

/** The venue device session this tab holds (set by tournament mode), so the app can keep it there. */
export const deviceSessionStore = writable<DeviceSession | null>(null)

const WRONG_CODE = 'That code is not valid. It works once and for 15 minutes: ask an organizer for a new one.'

export async function loadDevices(id: string): Promise<TournamentDevice[] | null> {
  try {
    return (await api.GET('/api/tournaments/{id}/devices', { params: { path: { id } } })).data?.devices ?? null
  } catch {
    return null
  }
}

/** A new pairing code, or why not. */
export async function addDevice(id: string): Promise<Pairing | { error: string }> {
  try {
    const res = await api.POST('/api/tournaments/{id}/devices', { params: { path: { id } } })
    return res.data ?? { error: res.error.error }
  } catch {
    return { error: 'Could not add a device. Try again.' }
  }
}

/** One device, or every device of the tournament when no id is given; whether it worked. */
export async function revokeDevices(id: string, deviceId?: string): Promise<boolean> {
  try {
    const res = deviceId
      ? await api.DELETE('/api/tournaments/{id}/devices/{deviceId}', { params: { path: { id, deviceId } } })
      : await api.DELETE('/api/tournaments/{id}/devices', { params: { path: { id } } })
    return res.response.ok
  } catch {
    return false
  }
}

/** Opens a pairing code on this device: its session, or the words for why not. */
export async function pairDevice(code: string): Promise<DeviceSession | { error: string }> {
  try {
    const res = await api.POST('/api/tournament-devices/pair', { body: { code } })
    if (res.data) return res.data
    return { error: res.response.status === 429 ? 'Too many tries. Wait a minute and try again.' : WRONG_CODE }
  } catch {
    return { error: 'Could not reach the server. Try again.' }
  }
}

/** The session this browser holds, null when it holds none (or a signed-in user is using it). */
export async function loadDeviceSession(): Promise<DeviceSession | null> {
  try {
    // Signed out is the answer here (no device, or its session ended), not a reason to open the sign-in page
    return (await quietApi.GET('/api/tournament-device')).data ?? null
  } catch {
    return null
  }
}

export async function renameDeviceSession(name: string): Promise<boolean> {
  try {
    return (await api.PATCH('/api/tournament-device', { body: { name } })).response.ok
  } catch {
    return false
  }
}

/** A code as shown and typed: "ABCD EFGH". */
export const formatPairCode = (code: string): string => `${code.slice(0, 4)} ${code.slice(4)}`

/** The link that opens the code on a device. */
export const pairLink = (origin: string, code: string): string => `${origin}/${hrefs.tournamentPair(code)}`

/** "Last seen 3 min ago", "Waiting for its code to be opened". */
export function deviceSeen(d: Pick<TournamentDevice, 'paired' | 'lastSeenAt'>, now: Date): string {
  if (!d.paired) return 'Waiting for its code to be opened'
  if (d.lastSeenAt === null) return 'Never seen'
  const min = Math.floor((now.getTime() - new Date(d.lastSeenAt).getTime()) / 60_000)
  if (min < 1) return 'Last seen just now'
  if (min < 60) return `Last seen ${min} min ago`
  const h = Math.floor(min / 60)
  return h < 24 ? `Last seen ${h} h ago` : `Last seen ${Math.floor(h / 24)} d ago`
}
