// The look of a player's card or row on the match screen: the thrower's lime-bordered card, the others' quiet one.

/** The thrower: the active surface with a 2 px accent border. */
export const ACTIVE_CARD = 'bg-surface-active border-2 border-accent'

/** Everyone else: the panel surface with a hairline. */
export const IDLE_CARD = 'bg-surface-panel border border-line-2'

/** A player who just lost (a Higher Lower life): a dark red card with a 2 px red border. */
export const LOST_CARD = 'bg-[#1d1513] border-2 border-live'

/** A player who is out of the game (Higher Lower): a dimmer card with a dashed hairline. */
export const OUT_CARD = 'bg-[#121411] border border-dashed border-line-2'

/** A card's state beyond throwing or waiting. */
export type CardTone = 'lost' | 'out' | null

export const playerCard = (active: boolean, tone: CardTone = null): string =>
  tone === 'lost' ? LOST_CARD : tone === 'out' ? OUT_CARD : active ? ACTIVE_CARD : IDLE_CARD

/** The name on a card: bright for the thrower (and a just-lost player), struck through once out. */
export const nameTone = (active: boolean, tone: CardTone = null): string =>
  tone === 'out' ? 'text-[#6d7066] line-through' : active || tone === 'lost' ? 'text-text' : 'text-ink-2'
