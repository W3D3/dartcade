import type { AtcGame, X01Game } from '../schema/game-ws.js'

/** Fields the engine adds to every game's view (see SessionEngine.getSnapshot). */
export type EngineViewField = 'currentVisitDarts' | 'totalDarts' | 'totalVisits'

/** What x01Game.view() returns; withBullOff adds `bullOff` (and may set phase to 'bulloff'). */
export type X01View = Omit<X01Game, EngineViewField | 'bullOff'>

/** What atcModule.view() returns. */
export type AtcView = Omit<AtcGame, EngineViewField>
