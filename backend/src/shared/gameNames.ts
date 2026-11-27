// Every playable game mode's name, for the server (challenge titles) and the SPA (titles, lobby
// lines, the Play page). One entry per game module id; `short` where a tight label needs less.
export const GAME_NAMES = {
  x01: { title: 'X01', short: 'X01' },
  atc: { title: 'Around the Clock', short: 'ATC' },
  p121: { title: '121', short: '121' },
  catch40: { title: 'Catch 40', short: 'Catch 40' },
  hilo: { title: 'Higher Lower', short: 'Higher Lower' },
  minigolf: { title: 'Minigolf', short: 'Minigolf' },
  cricket: { title: 'Cricket', short: 'Cricket' },
  mission: { title: 'Mission', short: 'Mission' },
  shanghai: { title: 'Shanghai', short: 'Shanghai' },
  dungeon: { title: 'Dungeon', short: 'Dungeon' },
} as const satisfies Record<string, { title: string; short: string }>

export type GameId = keyof typeof GAME_NAMES

/** Modes started only by their own route (a mission, from the missions API): never picked in a lobby, on the Play page or by POST /api/sessions. */
export const OWN_START: ReadonlySet<GameId> = new Set(['mission'])

/** Practice modes: shown in history, counted for no stats, ratings, form, XP, challenges or achievements (`gameCounts` in db/counts.ts). */
export const UNCOUNTED = ['mission', 'dungeon'] as const satisfies readonly GameId[]
export type UncountedId = (typeof UNCOUNTED)[number]
/** Co-op modes: the whole party wins or loses together (every seat places 1st), so a result reads Victory or Defeat from the seat's `victory` stat, not from the placement. */
export const COOP = ['dungeon'] as const satisfies readonly GameId[]
export const isCoop = (id: string): boolean => COOP.some(c => c === id)

export const isUncounted = (id: string): id is UncountedId => UNCOUNTED.some(u => u === id)

export const isGameId = (id: string): id is GameId => Object.hasOwn(GAME_NAMES, id)

/** A mode's title ("Around the Clock"); the id itself for one this build doesn't know. */
export const gameTitle = (id: string): string => (isGameId(id) ? GAME_NAMES[id].title : id)
