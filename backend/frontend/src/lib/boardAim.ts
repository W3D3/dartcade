// Long-press aiming on the dartboard: the board zooms in and an aim shows a little above the
// finger, moving at a fraction of its speed for precise placement. Held past the edge of the
// board area, the board keeps scrolling that way. Points are in the board SVG's view units
// (y down) before zooming; the zoom itself is a viewBox, so nothing on the board is transformed.

export type Pt = { x: number; y: number }
/** The square the board area shows (half its side) and how close to its edge the aim may get. */
export type ViewBox = { half: number; margin: number }

export const AIM_ZOOM = 3
/** How long a press must last before it zooms. */
export const AIM_HOLD_MS = 300
/** How far above the finger the aim shows, in screen pixels. */
export const AIM_OFFSET_PX = 70
/** Edge scrolling: view units per second, per view unit the finger is past the edge. */
export const AIM_EDGE_SPEED = 4

/** The aim offset for this pointer type: a touch needs lifting above the finger (which covers
 * the spot); a mouse or pen points right where the cursor is, so the aim sits under it. */
export function aimOffsetFor(pointerType: string, offsetPx: number): number {
  return pointerType === 'touch' ? offsetPx : 0
}

/** The aim after the finger moved from `last` to `finger`: 1/scale of the finger's movement. */
export function moveAim(aim: Pt, last: Pt, finger: Pt, scale = AIM_ZOOM): Pt {
  return { x: aim.x + (finger.x - last.x) / scale, y: aim.y + (finger.y - last.y) / scale }
}

const limit = (box: ViewBox) => box.half - box.margin
const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v))

/** Where the aim is drawn: `offset` above the finger, kept inside the board area. */
export function shownAt(finger: Pt, offset: number, box: ViewBox): Pt {
  return { x: clamp(finger.x, limit(box)), y: clamp(finger.y - offset, limit(box)) }
}

/** How far the wanted aim position is past the edge (zero inside): drives edge scrolling. */
export function edgePush(finger: Pt, offset: number, box: ViewBox): Pt {
  const want = { x: finger.x, y: finger.y - offset }
  const shown = shownAt(finger, offset, box)
  return { x: want.x - shown.x, y: want.y - shown.y }
}

/** The zoomed viewBox that draws the board point `aim` at `shown` on screen. */
export function viewBoxFor(aim: Pt, shown: Pt, scale: number, half: number): { x: number; y: number; w: number } {
  const w = (2 * half) / scale
  // A screen position p (in the unzoomed frame) shows board point x + (p + half) / scale
  return { x: aim.x - (shown.x + half) / scale, y: aim.y - (shown.y + half) / scale, w }
}
