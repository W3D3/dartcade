// What every game's live view hands the shared renderers: the open visit's dart slots as tiles, and the board's props.
import type { ComponentProps } from 'svelte'
import type DartBoard from '../components/DartBoard.svelte'
import type { Slot, SlotKind } from '../dartSlots.js'

/** A dart slot of the open visit: the dart (or the target to aim at) and a line under it. */
export type SlotTile = { label: string; note: string; kind: SlotKind }

/** What BoardBox draws: the open visit's darts, and what to light. */
type DartBoardProps = ComponentProps<typeof DartBoard>
export type BoardProps = Pick<DartBoardProps, 'darts'> & Partial<Pick<DartBoardProps, 'target' | 'nextTarget' | 'checkoutTargets'>>

/** The slots as tiles; the line under a thrown dart or a miss is its points, under the rest what to aim at, unless `note` says otherwise. */
export const toTiles = (slots: Slot[], note?: (s: Slot) => string | undefined): SlotTile[] =>
  slots.map(s => ({
    label: s.label,
    kind: s.kind,
    note: note?.(s) ?? (s.kind === 'thrown' || s.kind === 'miss' ? s.points : s.foot.toUpperCase()),
  }))
