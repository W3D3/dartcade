// Every playable game mode's name, for the server (challenge titles) and the SPA (titles, lobby
// lines, the Play page). One entry per game module id; `short` where a tight label needs less.
export const GAME_NAMES = {
  x01: { title: 'X01', short: 'X01' },
  atc: { title: 'Around the Clock', short: 'ATC' },
  p121: { title: '121', short: '121' },
  hilo: { title: 'Higher Lower', short: 'Higher Lower' },
  minigolf: { title: 'Minigolf', short: 'Minigolf' },
  cricket: { title: 'Cricket', short: 'Cricket' },
  mission: { title: 'Mission', short: 'Mission' },
} as const satisfies Record<string, { title: string; short: string }>

export type GameId = keyof typeof GAME_NAMES

/** Modes started only by their own route (a mission, from the missions API): never picked in a lobby, on the Play page or by POST /api/sessions. */
export const OWN_START: ReadonlySet<GameId> = new Set(['mission'])

export const isGameId = (id: string): id is GameId => Object.hasOwn(GAME_NAMES, id)

/** A mode's title ("Around the Clock"); the id itself for one this build doesn't know. */
export const gameTitle = (id: string): string => (isGameId(id) ? GAME_NAMES[id].title : id)
