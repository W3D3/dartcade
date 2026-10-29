import type { AtcGame, BullOffView, CricketGame, HiloGame, MinigolfGame, P121Game, X01Game } from '../schema/game-ws.js'

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

/** What p121Game.view() returns; withBullOff adds `bullOff` (and may set phase to 'bulloff'). */
export type P121View = Omit<P121Game, EngineViewField | 'bullOff'>

/** What p121Module.view() (121 with the bull off) returns. */
export type P121ModuleView = P121View & BullOffViewField

/** What minigolfModule.view() returns. */
export type MinigolfView = Omit<MinigolfGame, EngineViewField>

/** What hiloGame.view() returns; withBullOff adds `bullOff` (and may set phase to 'bulloff'). */
export type HiloView = Omit<HiloGame, EngineViewField | 'bullOff'>

/** What hiloModule.view() (Higher Lower with the bull off) returns. */
export type HiloModuleView = HiloView & BullOffViewField

/** What cricketGame.view() returns; withBullOff adds `bullOff` (and may set phase to 'bulloff'). */
export type CricketView = Omit<CricketGame, EngineViewField | 'bullOff'>

/** What cricketModule.view() (Cricket with the bull off) returns. */
export type CricketModuleView = CricketView & BullOffViewField
