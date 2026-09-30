// The manual advance: "Next player" when the visit is over (or without a board),
// otherwise the quiet "Skip to next" (on a board the takeout advances by itself).
export function nextButton(o: { manual: boolean; dartCount: number; locked: boolean; active: boolean }) {
  const done = o.manual || o.dartCount >= 3 || o.locked
  // After a win the button stays usable while the winning visit is open, so it can be committed
  return { label: done ? 'Next player' as const : 'Skip to next' as const, prominent: done, enabled: o.active || o.dartCount > 0 }
}
