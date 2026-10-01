import { z } from 'zod'

/** The last game setup, per device, so the next one starts from it. */
export const PREFS_KEY = 'dartcade_game_prefs'

const PrefsSchema = z.object({
  mode: z.string(),
  // Per game id; a game without (or with a broken) saved config has no entry
  configs: z.record(z.string(), z.record(z.string(), z.unknown()).optional().catch(undefined)).catch({}),
  boardId: z.string().optional().catch(undefined),
})
export type SavedPrefs = z.output<typeof PrefsSchema>

/** Saved prefs, or null when there are none (or no mode); a broken field is dropped on its own. */
export function loadPrefs(storage: Pick<Storage, 'getItem'> | null): SavedPrefs | null {
  try {
    const r = PrefsSchema.safeParse(JSON.parse(storage?.getItem(PREFS_KEY) ?? 'null'))
    if (!r.success) return null
    const { boardId, ...rest } = r.data
    return boardId === undefined ? rest : { ...rest, boardId }
  } catch { return null }
}

export function savePrefs(storage: Pick<Storage, 'setItem'> | null, p: SavedPrefs): void {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    // Storage full or blocked: prefs just don't persist
  }
}
