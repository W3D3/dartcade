<script lang="ts">
  // The lobby's throw order (the host): lobby order, random, or bull off. Bull off shows only
  // for a game that has one (or while it's picked); whether enough people play is the server's call.
  import type { Lobby, ThrowOrder } from '$lib/api/lobby-ws'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import Field from './Field.svelte'
  import { hasBullOff } from '$lib/lobby/rules'

  let { lobby, gameId, onchange }: {
    lobby: Lobby
    /** The game it's for: the lobby's next game, or the one picked on the Play page. */
    gameId: string | null
    onchange: (order: ThrowOrder) => void
  } = $props()

  const isOrder = (v: unknown): v is ThrowOrder => v === 'lobby' || v === 'random' || v === 'bulloff'
  const has = $derived(hasBullOff(gameId))
  // Still shown while it's the lobby's order, so what's picked is visible (and why it won't start)
  const options = $derived([
    { value: 'lobby', label: 'Lobby order' },
    { value: 'random', label: 'Random' },
    ...(has || lobby.throwOrder === 'bulloff'
      ? [{ value: 'bulloff', label: 'Bull-off', disabled: !has, title: has ? undefined : 'This game has no bull off' }]
      : []),
  ])
</script>

<Field label="Throw order">
  <SegmentedControl {options} value={lobby.throwOrder} onchange={(v) => { if (isOrder(v)) onchange(v) }} />
</Field>
