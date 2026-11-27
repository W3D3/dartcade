// The page's state: the setup being edited and the log of what was thrown at it. The shown state is
// always `replay(setup, log)`, so editing the setup re-runs the log against the new situation.
import { liveCatalogue } from './catalogue.js'
import { replay, step, type Action } from './session.js'
import { SCENARIOS } from './presets.js'
import { emptySetup, type Setup } from './setup.js'

export function createPlayground() {
  let setup = $state<Setup>(structuredClone(SCENARIOS[0].setup))
  let log = $state<Action[]>([])
  let script = $state(SCENARIOS[0].script)
  // The engine and structuredClone want plain objects, not $state proxies
  const plain = () => [$state.snapshot(setup), $state.snapshot(log)] as const
  const state = $derived(replay(...plain()))
  const catalogue = $derived(liveCatalogue())

  return {
    get setup() {
      return setup
    },
    set setup(s: Setup) {
      setup = s
    },
    get log() {
      return log
    },
    get script() {
      return script
    },
    set script(v: string) {
      script = v
    },
    get state() {
      return state
    },
    get catalogue() {
      return catalogue
    },
    do(a: Action) {
      // an action that changes nothing is not worth a log line
      // compared by value: a derived read outside an effect is recomputed, so its identity says nothing
      const [s, l] = plain()
      const now = replay(s, l)
      if (JSON.stringify(step(s, now, a)) !== JSON.stringify(now)) log = [...log, a]
    },
    rewind(n: number) {
      log = log.slice(0, n)
    },
    load(s: Setup, scriptText = '') {
      setup = structuredClone(s)
      log = []
      script = scriptText
    },
    reset() {
      this.load(emptySetup(setup.seed))
    },
  }
}

export type Playground = ReturnType<typeof createPlayground>
