<script lang="ts">
  // The lobby's throw order (the host): lobby order, random, or bull off. Bull off shows only
  // for a game that has one (or while it's picked); whether enough people play is the server's call.
  // While it's on because the game's settings turned it on, the other two options are locked:
  // turning it off happens in the game's settings (Bull off), which the server then mirrors here.
  import type { Lobby, ThrowOrder } from '$lib/api/lobby-ws'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import Field from './Field.svelte'
  import { hasBullOff } from '$lib/lobby/rules'

  let { lobby, gameId, onchange }: {
    lobby: Lobby
    /** The game it's for: the lobby's next game. */
    gameId: string | null
    onchange: (order: ThrowOrder) => void
  } = $props()

  const isOrder = (v: unknown): v is ThrowOrder => v === 'lobby' || v === 'random' || v === 'bulloff'
  const has = $derived(hasBullOff(gameId))
  // The game's settings turned bull off on (the server keeps throwOrder and the game's bull
  // off field in sync): lobby order and random are locked while it is, with a hint pointing
  // at where to turn it off.
  const lockedByGame = $derived(lobby.throwOrder === 'bulloff')
  const lockHint = 'Bull off is on in the game settings'
  // Still shown while it's the lobby's order, so what's picked is visible (and why it won't start)
  const options = $derived([
    { value: 'lobby', label: 'Lobby order', disabled: lockedByGame, title: lockedByGame ? lockHint : undefined },
    { value: 'random', label: 'Random', disabled: lockedByGame, title: lockedByGame ? lockHint : undefined },
    ...(has || lobby.throwOrder === 'bulloff'
      ? [{ value: 'bulloff', label: 'Bull-off', disabled: !has, title: has ? undefined : 'This game has no bull off' }]
      : []),
  ])
</script>

<Field label="Throw order">
  <SegmentedControl {options} value={lobby.throwOrder} onchange={(v) => { if (isOrder(v)) onchange(v) }} />
</Field>
