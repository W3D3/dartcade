// Props the checkout practice screens share (121 Checkout, Catch 40).
import type { MatchControls, MatchProps } from '$lib/components/match/types'
import type { Who } from '$lib/face'
import type { Segment } from '$lib/api'
import type { GameSettings } from '$lib/gameSettings'
import type { CheckoutPrefs } from '$shared/checkout.js'

/** What every practice mode's match screen takes besides its game (the match screen's controls and the shared bits). */
export type PracticeBase = {
  players: { name: string }[]
  /** Per seat: its name, bot and picture. */
  who: Who[]
  /** The open visit's darts, drawn where they landed. */
  darts: { segment: Segment; score: number; coords?: { x: number; y: number } }[]
  settings: GameSettings
  checkout?: CheckoutPrefs
  keypad?: boolean
  onDart?: (segment: Segment) => void
  viewOnly?: boolean
  turn?: MatchProps['turn']
} & MatchControls

/** What the shared screen reads of a mode's game (both modes' views have it). */
export type PracticeGame = {
  currentPlayer: number
  phase: string
  bust: boolean
  visitStartLeft: number
  seats: { target: number; left: number; done: boolean }[]
}

type Action = { label: string; onclick: () => void }

/** What every practice summary takes besides its detail and standings. */
export type PracticeSummaryBase = {
  players: { name: string }[]
  /** Whose summary shows first: the viewer's seat. */
  seat: number
  /** The detail is on its way (a player's screen); false for a spectator, who never gets it. */
  loading?: boolean
  primary?: Action | null
  secondary?: Action | null
}
