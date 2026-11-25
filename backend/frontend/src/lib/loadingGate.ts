// When to show a loading skeleton so it never flickers: nothing for the first `delay` ms (a fast
// load shows the content straight away), and once shown it stays `hold` ms. `holding` says a
// skeleton (or its reserved space) stands in for the content; `revealed` says it is painted;
// `waited` says the content arrived after a wait, so it should fade in.
export type Gate = { holding: boolean; revealed: boolean; waited: boolean }

export const GATE_DELAY_MS = 150
export const GATE_HOLD_MS = 300

export function createGate(onChange: (g: Gate) => void, loading: boolean, delay = GATE_DELAY_MS, hold = GATE_HOLD_MS) {
  let state: Gate = { holding: false, revealed: false, waited: false }
  let current = false
  let shownAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const emit = (patch: Partial<Gate>) => onChange((state = { ...state, ...patch }))
  const clear = () => clearTimeout(timer)

  function set(next: boolean): void {
    if (next === current) return
    current = next
    clear()
    if (next) {
      if (!state.holding) emit({ holding: true, waited: true })
      if (!state.revealed)
        timer = setTimeout(() => {
          shownAt = Date.now()
          emit({ revealed: true })
        }, delay)
      return
    }
    const left = state.revealed ? hold - (Date.now() - shownAt) : 0
    const done = () => emit({ holding: false, revealed: false })
    if (left > 0) timer = setTimeout(done, left)
    else done()
  }

  if (loading) set(true)
  else onChange(state)
  return { set, stop: clear }
}
