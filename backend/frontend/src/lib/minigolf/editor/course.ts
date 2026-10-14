// The course editor's wording and sums (routes/MinigolfCourses.svelte): totals, a hole's
// tags and provenance, a course's status chip, a refused publish's problems, a new hole.
import type { components } from '$lib/api/schema'
import type { DraftStatus, PublishProblem } from './store.svelte'
import { plural } from '$lib/fmt'

type ApiHole = components['schemas']['MinigolfHole']
export type HoleRow = components['schemas']['MinigolfHoleRow']
export type CourseRow = components['schemas']['MinigolfCourse']

/** A row's current content: its draft, else what's published. */
export const holeOf = (row: HoleRow): ApiHole | null => row.draft ?? row.published

/** Holes, total par and a rough playing time for one player (about 2 minutes a hole). */
export function courseTotals(holes: { par: number }[]): { holes: number; par: number; minutes: number } {
  return { holes: holes.length, par: holes.reduce((n, h) => n + h.par, 0), minutes: holes.length * 2 }
}

/** What's on a hole besides felt, as the design's row tag line ("2 bumpers · 1 wall · slope"). */
export function holeTags(h: ApiHole): string {
  return [
    h.bumpers.length > 0 && plural(h.bumpers.length, 'bumper'),
    h.walls.length > 0 && plural(h.walls.length, 'wall'),
    h.slopes.length > 0 && 'slope',
    (h.terrain?.length ?? 0) > 0 && 'terrain',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** "Official · in 2 courses", "Official · not used yet". */
export function provenance(row: HoleRow): string {
  const who = row.ownerUserId === null ? 'Official' : 'Yours'
  const used = row.usedBy ?? 0
  return `${who} · ${used === 0 ? 'not used yet' : `in ${plural(used, 'course')}`}`
}

/** The status chip on a course in the list; `hasChanges` counts its holes' drafts too. */
export function courseStatus(row: CourseRow): 'Published' | 'Draft changes' | 'Not published' {
  if (row.published === null) return 'Not published'
  return row.hasChanges ? 'Draft changes' : 'Published'
}

/** A refused publish's blocking checks, one line each in playing order ("Hole 2 · Outline crosses itself");
 *  a problem with the course itself (holeId '') comes first, without a hole. */
export function problemLines(problems: PublishProblem[], holeIds: string[]): string[] {
  return problems
    .map(p => ({ at: holeIds.indexOf(p.holeId), p }))
    .sort((a, b) => a.at - b.at)
    .flatMap(({ at, p }) => p.checks.filter(c => c.level === 'error').map(c => (p.holeId ? `Hole ${at + 1} · ${c.message}` : c.message)))
}

/**
 * What to say under the header after Publish changes: nothing once published; the blocking checks;
 * nothing for a conflict or a deleted course (the header and the page already say so); otherwise
 * an error: that the draft isn't saved, or (`threw`: a network or server error) to try again.
 */
export function publishOutcome(
  res: PublishProblem[] | null | { notSaved: DraftStatus } | 'threw',
  holeIds: string[],
): { problems: string[]; error: string | null } {
  if (res === null) return { problems: [], error: null }
  if (res === 'threw') return { problems: [], error: "Couldn't publish. Try again." }
  if (Array.isArray(res)) return { problems: problemLines(res, holeIds), error: null }
  if (res.notSaved === 'conflict' || res.notSaved === 'missing') return { problems: [], error: null }
  return { problems: [], error: "Couldn't publish: the draft isn't saved yet." }
}

/** A new hole: a 600 × 2000 mm lane, tee near the bottom, cup near the top, par 2. The server assigns its id. */
export function newHole(): ApiHole {
  return {
    id: 'new',
    name: 'New hole',
    par: 2,
    outline: [
      [0, 0],
      [600, 0],
      [600, 2000],
      [0, 2000],
    ],
    walls: [],
    bumpers: [],
    slopes: [],
    tee: [300, 1750],
    cup: { at: [300, 300], r: 80 },
  }
}
