import type { Snippet } from 'svelte'
import type { Segment, UserAction } from '$lib/api'
import type { CameraVersions } from '$lib/camera'
import type { GameSettings } from '$lib/gameSettings'
import type { MatchLayout } from '$lib/matchLayout'
import type { matchView } from '$lib/matchView'
import type { CenterState, TurnStatus } from '$lib/remote'
import type { Snapshot } from '$lib/ws'

type Hit = { segment: Segment; coords: { x: number; y: number } }

/**
 * What every mode's match screen is given (MatchScreen passes it on whole). GameDisplay fills it from the
 * viewer's session; the big screen from `viewOnlyProps` (lib/bigscreen/viewOnly.ts): nothing to press.
 * Each mode's screen in `lib/components/match/screens/` reads the game it needs from `snapshot`.
 */
export type MatchProps = {
  snapshot: Snapshot
  /** The derivations for this snapshot (lib/matchView.ts). */
  mv: ReturnType<typeof matchView>
  layout: MatchLayout
  settings: GameSettings
  /** The dart open in the correction popover; also highlighted on the board. */
  correcting?: number | null
  /** The big screen: no controls, no entry, nothing to tap. */
  viewOnly: boolean
  /** Remote games: where the thrower is, and what the centre shows when it isn't you. */
  remote: CenterState
  /** `remote` as the status bar that stands in for Undo and Next when someone else is up. */
  turn: TurnStatus | null
  /** The header's Enter view: the keypad takes the board's place. */
  keypad: boolean
  /** Whether this viewer may act for the seat that is up (also gates the bull off's buttons). */
  myTurn: boolean
  canThrow: boolean
  locked: boolean
  canUndo: boolean
  next: { label: string; prominent: boolean; enabled: boolean }
  cameraSrc: string | null
  cameraVersions: CameraVersions
  /** The viewer is the host (minigolf: they start the next hole). */
  host: boolean
  /** No board attached: darts come in by hand. */
  manual: boolean
  send: (action: UserAction) => void
  onUndo: () => void
  onNext: () => void
  onDart: (segment: Segment) => void
  onCorrect: (dartIndex: number, label: string) => void
  onDartMove?: (dartIndex: number, hit: Hit) => void
  onBoardClick: (hit: Hit) => void
  onabort?: () => void
  /** Minigolf: a roll is done, so the page may show the win. */
  onrolled?: (key: string) => void
  /** The live coach (solo X01 only). */
  coach?: Snippet<[compact: boolean]>
}
