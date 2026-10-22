// What just happened at the board, read from two consecutive snapshots of the same game: a dart
// landed (and how), a visit went bust, or the turn moved on. The match screen's sounds (the tones
// and the thrower's sound pack) play from it.
import type { AtcGame, X01Game } from '$lib/api/game-ws'

export type DartSound = 'hit' | 'double' | 'treble' | 'miss' | 'bust'
export type DartEvent = { kind: DartSound | 'switch'; seat: number }
/** What the events read of an X01 or Around the Clock game. */
export type EventGame = Pick<X01Game, 'currentPlayer' | 'currentVisitDarts'> &
  Partial<Pick<X01Game, 'bustThisVisit'> & Pick<AtcGame, 'currentVisitHits'>>

/** The event between `before` and `after`; null when nothing a sound marks happened (a correction, a takeout). */
export function dartEvent(before: EventGame, after: EventGame): DartEvent | null {
  const seat = after.currentPlayer
  if (after.bustThisVisit === true && before.bustThisVisit !== true) return { kind: 'bust', seat }
  const now = after.currentVisitDarts
  if (now.length > before.currentVisitDarts.length) {
    const i = now.length - 1
    const dart = now[i]
    // Around the Clock: a hit is the target, whatever the bed; X01: anything that scores
    const hit = after.currentVisitHits ? after.currentVisitHits.at(i) === true : dart.score > 0
    if (!hit) return { kind: 'miss', seat }
    return { kind: dart.segment.multiplier === 3 ? 'treble' : dart.segment.multiplier === 2 ? 'double' : 'hit', seat }
  }
  if (after.currentPlayer !== before.currentPlayer) return { kind: 'switch', seat }
  return null
}
