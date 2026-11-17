import { perk } from '$shared/progression'
import type { TournamentSummary } from '$lib/api'
import { ordinal } from '$lib/fmt'
import { fmtXp } from '$lib/progress/view'

type Prize = TournamentSummary['prizes'][number]

/** "1st", "2nd", "3–4". */
export const placeLabel = (p: Pick<Prize, 'from' | 'to'>): string => (p.from === p.to ? ordinal(p.from) : `${p.from}–${p.to}`)

/** "2,000 XP", grouped like XP everywhere else. */
export const xpLabel = (xp: number): string => `${fmtXp(xp)} XP`

/** The title a prize unlocks, by name; null without one. */
export const titleName = (p: Pick<Prize, 'title'>): string | null => (p.title ? (perk(p.title)?.name ?? null) : null)

/**
 * The tournament Browse features: the next official one still taking registrations. The list comes
 * sorted by start, so the first match is the soonest.
 */
export const heroOf = <T extends Pick<TournamentSummary, 'kind' | 'status'>>(list: readonly T[]): T | undefined =>
  list.find(t => t.kind === 'official' && (t.status === 'open' || t.status === 'check_in'))
