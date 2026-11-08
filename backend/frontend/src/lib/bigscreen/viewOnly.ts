// What MatchScreen gets for a game nobody plays on this screen: no entry, no controls.
import type { MatchProps } from '$lib/components/match/types'
import type { Snapshot } from '$lib/ws'

export const noop = () => undefined

/** MatchScreen's props for the big screen, besides the snapshot, `mv`, `layout` and `settings`. */
export const viewOnlyProps = (snapshot: Snapshot): Omit<MatchProps, 'snapshot' | 'mv' | 'layout' | 'settings'> => ({
  viewOnly: true,
  remote: { kind: 'play' },
  turn: null,
  keypad: false,
  myTurn: false,
  canThrow: false,
  locked: 'visitLocked' in snapshot.game && snapshot.game.visitLocked,
  canUndo: false,
  next: { label: '', prominent: false, enabled: false },
  cameraSrc: null,
  cameraVersions: {},
  host: false,
  manual: false,
  send: noop,
  onUndo: noop,
  onNext: noop,
  onDart: noop,
  onCorrect: noop,
  onBoardClick: noop,
})
