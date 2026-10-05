// The look of a player's card or row on the match screen: the thrower's lime-bordered card, the others' quiet one.

/** The thrower: the active surface with a 2 px accent border. */
export const ACTIVE_CARD = 'bg-surface-active border-2 border-accent'

/** Everyone else: the panel surface with a hairline. */
export const IDLE_CARD = 'bg-surface-panel border border-line-2'

export const playerCard = (active: boolean): string => (active ? ACTIVE_CARD : IDLE_CARD)
