/** When a board's big screen runs: never, whenever a game starts, or only when the owner starts it. */
export type BigScreenMode = 'off' | 'auto' | 'manual'

export const BIG_SCREEN_MODES: readonly BigScreenMode[] = ['off', 'auto', 'manual']
