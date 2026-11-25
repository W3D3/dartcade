// The missions routes (schema/api-v1.yaml, tag missions) as the list, its dialogs and the result screen call them.
import { api } from '$lib/api'
import type { Difficulty, MissionBest, MissionCard, MissionFilter, MissionVisibility } from './view'

type Result<T = true> = { ok: T } | { error: string }

/** A tab's cards; null if the request failed. */
export async function loadMissions(filter: MissionFilter, difficulty: Difficulty | null): Promise<MissionCard[] | null> {
  const query = difficulty ? { filter, difficulty } : { filter }
  return (await api.GET('/api/missions', { params: { query } })).data?.missions ?? null
}

export async function loadHighscores(id: string): Promise<MissionBest[] | null> {
  return (await api.GET('/api/missions/{id}/highscores', { params: { path: { id } } })).data?.highscores ?? null
}

export async function deleteMission(id: string): Promise<Result> {
  const res = await api.DELETE('/api/missions/{id}', { params: { path: { id } } })
  return res.error ? { error: "Couldn't delete the mission." } : { ok: true }
}

/** Shares a mission with whom else may see it; the card as it is now. */
export async function setVisibility(card: MissionCard, visibility: MissionVisibility): Promise<Result<MissionCard>> {
  const res = await api.PUT('/api/missions/{id}', { params: { path: { id: card.id } }, body: { mission: card.mission, visibility } })
  return res.data ? { ok: res.data } : { error: "Couldn't change who sees it." }
}

export async function reportMission(id: string, reason: string): Promise<Result> {
  const res = await api.POST('/api/missions/{id}/report', { params: { path: { id } }, body: { reason: reason.trim() } })
  if (!res.error) return { ok: true }
  return { error: res.response.status === 409 ? 'You already reported this mission.' : "Couldn't send the report." }
}

/** Starts a game of the mission, alone or for the lobby the user hosts; the new game's id. */
export async function startMission(id: string, lobbyId: string | null): Promise<Result<string>> {
  const res = await api.POST('/api/missions/{id}/start', {
    params: { path: { id } },
    body: { test: false, force: false, ...(lobbyId ? { lobbyId } : {}) },
  })
  if (res.data) return { ok: res.data.sessionId }
  return { error: res.error.error }
}
