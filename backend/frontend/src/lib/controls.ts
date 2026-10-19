// The manual advance: "Next player" when the visit is over (or without a board),
// otherwise the quiet "Skip to next" (on a board the takeout advances by itself).
// A visit that wins the game waits for "Finish game": the takeout doesn't end it, so a
// misread dart can still be corrected first. A visit that wins a leg (but not the match)
// shows "Next leg" instead.
export interface NextButton {
  label: 'Next player' | 'Skip to next' | 'Finish game' | 'Next leg'
  prominent: boolean
  enabled: boolean
}

export function nextButton(o: {
  manual: boolean
  dartCount: number
  locked: boolean
  active: boolean
  finish?: boolean
  legWon?: boolean
}): NextButton {
  if (o.finish) return { label: 'Finish game', prominent: true, enabled: o.active }
  if (o.legWon) return { label: 'Next leg', prominent: true, enabled: o.active }
  const done = o.manual || o.dartCount >= 3 || o.locked
  return { label: done ? 'Next player' : 'Skip to next', prominent: done, enabled: o.active }
}
