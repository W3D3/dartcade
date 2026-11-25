// When a loading indicator shows: not before `delay` (a fast load never flashes one), and `slow`
// once the wait passes `timeout` so nothing spins forever. It starts timing when created, starts
// again on `restart` (a retry) and stops when its owner is destroyed, which is when the load ends.
export const LOADING_DELAY_MS = 150
export const LOADING_TIMEOUT_MS = 12_000

export type WaitTimes = { delay: number; timeout: number }

export class WaitGate {
  shown = $state(false)
  slow = $state(false)

  #timers: ReturnType<typeof setTimeout>[] = []
  #times: WaitTimes

  constructor({ delay = LOADING_DELAY_MS, timeout = LOADING_TIMEOUT_MS }: Partial<WaitTimes> = {}) {
    this.#times = { delay, timeout }
    this.#start()
  }

  restart() {
    this.destroy()
    this.shown = false
    this.slow = false
    this.#start()
  }

  #start() {
    const { delay, timeout } = this.#times
    if (delay <= 0) this.shown = true
    else this.#timers.push(setTimeout(() => (this.shown = true), delay))
    if (timeout <= 0) this.slow = true
    else this.#timers.push(setTimeout(() => (this.slow = true), timeout))
  }

  destroy() {
    for (const t of this.#timers) clearTimeout(t)
    this.#timers = []
  }
}
