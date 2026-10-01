import type { AtcGame, BullOffView, X01Game } from '../schema/game-ws.js'

/** Fields the engine adds to every game's view (see SessionEngine.getSnapshot). */
export type EngineViewField = 'currentVisitDarts' | 'totalDarts' | 'totalVisits'

/** What x01Game.view() returns; withBullOff adds `bullOff` (and may set phase to 'bulloff'). */
export type X01View = Omit<X01Game, EngineViewField | 'bullOff'>

/** What a game wrapped by withBullOff adds to its view. */
export type BullOffViewField = { bullOff: BullOffView | null }

/** What x01Module.view() (X01 with the bull off) returns. */
export type X01ModuleView = X01View & BullOffViewField

/** What atcModule.view() returns. */
export type AtcView = Omit<AtcGame, EngineViewField>
