import { createGate, type Gate } from './loadingGate'

/** `createGate` for a component: call it while the component initialises; `loading` is read reactively. */
export function loadingGate(loading: () => boolean): Gate {
  const gate = $state<Gate>({ holding: false, revealed: false, waited: false })
  const controller = createGate(g => Object.assign(gate, g), loading())
  $effect(() => {
    controller.set(loading())
  })
  $effect(() => controller.stop)
  return gate
}
