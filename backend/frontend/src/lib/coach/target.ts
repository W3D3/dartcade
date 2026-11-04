// The tier the coach grades you as ("Coach me as…" on the Coach page and in Settings): an account
// setting (gameSettings.ts coachTarget), auto by default, which follows your 30-day average.
import { derived } from 'svelte/store'
import { accountSettings, flushAccountSettings, writeThrough } from '$lib/accountSettings'
import { api } from '$lib/api/client'
import { loadSettings, saveSettings } from '$lib/gameSettings'
import { deviceStore } from '$lib/storage'
import { COACH_TIERS, type CoachTarget, type CoachTierId } from '$shared/coach/tiers'

/** The account's target once loaded, else this device's */
export const coachTarget = derived(accountSettings, a => a?.coachTarget ?? loadSettings(deviceStore()).coachTarget)

/** Saves a new target on this device and the account, resolving once the account has it. */
export async function setCoachTarget(target: CoachTarget): Promise<void> {
  const s = { ...loadSettings(deviceStore()), coachTarget: target }
  saveSettings(deviceStore(), s)
  writeThrough(s)
  await flushAccountSettings()
}

/** Your 30-day X01 average, as the coach suggests a tier from it; null without one or on an error. */
export async function fetchCoachAverage(): Promise<number | null> {
  try {
    return (await api.GET('/api/coach/average')).data?.average ?? null
  } catch {
    return null
  }
}

export type TierChoice = { value: CoachTierId; label: string }

/** The six tiers with their averages, the suggested one marked: picking it is auto, so it follows your average. */
export const tierChoices = (suggested: CoachTierId): TierChoice[] =>
  COACH_TIERS.map(t => ({
    value: t.id,
    label: `${t.name} · ${t.average} avg${t.id === suggested ? ' · Recommended for you' : ''}`,
  }))

/** The tier the select shows for a target: auto shows the suggestion */
export const shownTier = (target: CoachTarget, suggested: CoachTierId): CoachTierId => (target === 'auto' ? suggested : target)

/** The target to store for a picked tier: the suggested one is auto */
export const pickedTarget = (tier: CoachTierId, suggested: CoachTierId): CoachTarget => (tier === suggested ? 'auto' : tier)
