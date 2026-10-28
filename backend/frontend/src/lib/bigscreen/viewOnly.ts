// The props the match screens (P121Match, HiloMatch) want for a game nobody plays on this screen: no entry, no controls.
export const noop = () => undefined

export const VIEW_ONLY = {
  canThrow: false,
  canUndo: false,
  next: { label: '', prominent: false, enabled: false },
  onUndo: noop,
  onNext: noop,
  onBoardClick: noop,
  onGiveUp: noop,
  viewOnly: true,
}
