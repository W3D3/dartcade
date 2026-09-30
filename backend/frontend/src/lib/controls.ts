// The manual advance: "Next player" when the visit is over (or without a board),
// otherwise the quiet "Skip to next" (on a board the takeout advances by itself).
export interface NextButton { label: 'Next player' | 'Skip to next'; prominent: boolean; enabled: boolean }

export function nextButton(o: { manual: boolean; dartCount: number; locked: boolean; active: boolean }): NextButton {
  const done = o.manual || o.dartCount >= 3 || o.locked
  // After a win the button stays usable while the winning visit is open, so it can be committed
  return { label: done ? 'Next player' : 'Skip to next', prominent: done, enabled: o.active || o.dartCount > 0 }
}
