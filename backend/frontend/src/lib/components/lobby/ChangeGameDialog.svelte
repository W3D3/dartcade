<script lang="ts">
  // The host picks the lobby's next game: the Play page's mode tiles, then "Use <game>".
  // Only the mode changes here; its settings start from the mode's defaults.
  import type { GameInfo } from '$lib/api'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import GameModeTiles from '$lib/components/GameModeTiles.svelte'
  import { canSwitchTo } from '$lib/gameModes'
  import { gameName } from '$lib/lobby/format'

  let {
    current,
    games,
    onpick,
    oncancel,
  }: {
    /** The lobby's next game now, if any. */
    current: string | null
    /** The backend's modes: only those can be picked. */
    games: GameInfo[]
    onpick: (gameId: string) => void
    oncancel: () => void
  } = $props()

  // Starts on the current game, so the button waits for a different one
  // svelte-ignore state_referenced_locally
  let picked = $state<string | null>(current)
  const ok = $derived(canSwitchTo(picked, current, games))

  function confirm() {
    const id = picked
    if (id && ok) onpick(id)
  }
</script>

<Modal title={current ? 'Change game' : 'Pick a game'} onclose={oncancel} dismissOnBackdrop widthClass="max-w-[440px]" zClass="z-[200]">
  <GameModeTiles selected={picked} compact onselect={(id: string) => (picked = id)} />
  {#snippet footer()}
    <Button variant="outline" size="lg" class="flex-1" onclick={oncancel}>Cancel</Button>
    <Button variant="accent" size="lg" class="flex-1" disabled={!ok} onclick={confirm}>
      {picked ? `Use ${gameName(picked)}` : 'Use this game'}
    </Button>
  {/snippet}
</Modal>
