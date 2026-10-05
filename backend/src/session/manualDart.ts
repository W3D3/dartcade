import type { Dart, Segment } from './types.js'

/** Polar form of normalised board coords: r = 1 at the outer double wire, theta counterclockwise from +x. */
export function polarFromCoords(c: { x: number; y: number }): { r: number; theta_deg: number } {
  return { r: Math.hypot(c.x, c.y), theta_deg: (Math.atan2(c.y, c.x) * 180) / Math.PI }
}

/** A dart entered by hand, with the spot it was placed on the board when there is one. */
export function manualDart(segment: Segment, coords?: { x: number; y: number }): Dart {
  const dart: Dart = { segment, score: segment.number * segment.multiplier }
  if (coords && Number.isFinite(coords.x) && Number.isFinite(coords.y)) {
    dart.coords = { x: coords.x, y: coords.y }
    dart.polar = polarFromCoords(coords)
  }
  return dart
}
