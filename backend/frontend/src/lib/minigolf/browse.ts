// Browsing and reporting user-made minigolf courses (schema/api-v1.yaml, tag minigolf), and what moderators do about reports.
import { api } from '$lib/api'
import type { components } from '$lib/api/schema'
import { plural } from '$lib/fmt'

export type BrowseCourse = components['schemas']['MinigolfBrowseCourse']
export type ReportList = components['schemas']['MinigolfReportList']

export const DIFFICULTY_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' } as const

/** "by Olive · 9 holes · 12 plays" */
export const courseMeta = (c: BrowseCourse): string =>
  `by ${c.authorName ?? 'a player'} · ${plural(c.holeCount, 'hole')} · ${plural(c.plays, 'play')}`

/** The courses matching `search`, most played first; null if the request failed. */
export async function loadBrowse(search: string): Promise<BrowseCourse[] | null> {
  const q = search.trim()
  const res = await api.GET('/api/minigolf/browse', { params: { query: q ? { search: q } : {} } })
  return res.data?.courses ?? null
}

/** Reports a course; the sentence to show if that did not work. */
export async function reportCourse(id: string, reason: string): Promise<{ ok: true } | { error: string }> {
  const res = await api.POST('/api/minigolf/courses/{id}/report', { params: { path: { id } }, body: { reason: reason.trim() } })
  if (!res.error) return { ok: true }
  if (res.response.status === 409)
    return { error: res.error.error === 'your own course' ? "That's your own course." : 'You already reported this course.' }
  return { error: "Couldn't send the report." }
}

export async function loadReports(): Promise<ReportList | null> {
  return (await api.GET('/api/admin/minigolf/reports')).data ?? null
}

export type ModerationAction = 'unpublish' | 'remove' | 'dismiss-reports' | 'allow'

/** A moderator's action on a course; the reason is required for unpublish and remove. */
export async function moderate(id: string, action: ModerationAction, reason = ''): Promise<{ ok: true } | { error: string }> {
  const params = { path: { id } }
  const res =
    action === 'unpublish'
      ? await api.POST('/api/admin/minigolf/courses/{id}/unpublish', { params, body: { reason: reason.trim() } })
      : action === 'remove'
        ? await api.POST('/api/admin/minigolf/courses/{id}/remove', { params, body: { reason: reason.trim() } })
        : action === 'allow'
          ? await api.POST('/api/admin/minigolf/courses/{id}/allow', { params })
          : await api.POST('/api/admin/minigolf/courses/{id}/dismiss-reports', { params })
  return res.error ? { error: res.error.error } : { ok: true }
}
