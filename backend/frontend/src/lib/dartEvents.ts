// What just happened at the board, read from two consecutive snapshots of the same game: a dart
// landed (and how), a visit went bust, or the turn moved on. The match screen's sounds (the tones
// and the thrower's sound pack) play from it.
import type { Dart, Snapshot } from '$lib/api/game-ws'

export type DartSound = 'hit' | 'double' | 'treble' | 'miss' | 'bust'
/** `number` is the segment of a treble, which decides whether it gets the treble sound. */
export type DartEvent = { kind: DartSound | 'switch'; seat: number; number?: number }
/** What the events read of a game: the seat up, the open visit's darts, the seat whose visit just
 *  went bust (null for none), and which darts hit (left out: a dart that scores is a hit). */
export type EventGame = {
  currentPlayer: number
  currentVisitDarts: Dart[]
  bust?: number | null
  currentVisitHits?: boolean[]
}

/** How each game mode reads as dart events; a mode added to the snapshot must say how it sounds here. */
function eventGame(s: Snapshot): EventGame {
  switch (s.gameId) {
    case 'x01':
      return { ...s.game, bust: s.game.bustThisVisit ? s.game.currentPlayer : null }
    case 'atc':
      return s.game
    case 'p121':
      return { ...s.game, bust: s.game.bust ? s.game.currentPlayer : null }
    case 'hilo': {
      // A lost life is the bust; the turn has already moved on, so it sounds for the seat that lost it
      const r = s.game.lastResult
      return { ...s.game, bust: r && (r.outcome === 'between' || r.outcome === 'miss') ? r.seat : null }
    }
    case 'minigolf':
      // Every dart is a putt
      return { ...s.game, currentVisitHits: s.game.currentVisitDarts.map(() => true) }
    case 'cricket': {
      // A hit is a dart on one of the targets (the bullseye arrives as 50)
      const targets = s.game.targets
      const hit = (d: Dart) => d.segment.multiplier > 0 && targets.includes(d.segment.number === 50 ? 25 : d.segment.number)
      return { ...s.game, currentVisitHits: s.game.currentVisitDarts.map(hit) }
    }
  }
}

/** The event between two snapshots of the same game mode; null across modes. */
export function snapshotEvent(before: Snapshot, after: Snapshot): DartEvent | null {
  if (before.gameId !== after.gameId) return null
  return dartEvent(eventGame(before), eventGame(after))
}

/** Which sound a dart plays under the switches: a treble of a number not above `trebleAbove` (or
 *  with the treble sound off) plays the hit; null when its switch is off. */
export function dartSound(
  kind: DartSound,
  on: { soundHit: boolean; soundTreble: boolean; trebleAbove: number; soundMiss: boolean; soundBust: boolean },
  number = 0,
): DartSound | null {
  if (kind === 'bust') return on.soundBust ? 'bust' : null
  if (kind === 'miss') return on.soundMiss ? 'miss' : null
  if (kind === 'treble' && on.soundTreble && number > on.trebleAbove) return 'treble'
  return on.soundHit ? (kind === 'treble' ? 'hit' : kind) : null
}

/** The event between `before` and `after`; null when nothing a sound marks happened (a correction, a takeout). */
export function dartEvent(before: EventGame, after: EventGame): DartEvent | null {
  const seat = after.currentPlayer
  if (after.bust != null && before.bust == null) return { kind: 'bust', seat: after.bust }
  const now = after.currentVisitDarts
  if (now.length > before.currentVisitDarts.length) {
    const i = now.length - 1
    const dart = now[i]
    // Around the Clock: a hit is the target, whatever the bed; otherwise anything that scores
    const hit = after.currentVisitHits ? after.currentVisitHits.at(i) === true : dart.score > 0
    if (!hit) return { kind: 'miss', seat }
    if (dart.segment.multiplier === 3) return { kind: 'treble', seat, number: dart.segment.number }
    return { kind: dart.segment.multiplier === 2 ? 'double' : 'hit', seat }
  }
  if (after.currentPlayer !== before.currentPlayer) return { kind: 'switch', seat }
  return null
}
