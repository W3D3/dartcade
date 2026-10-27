<script lang="ts">
  // A game without a big screen design: its title, centred.
  import { getGameView } from '$lib/gameViews'
  import type { Snapshot } from '$lib/ws'

  let { snapshot }: { snapshot: Snapshot | null } = $props()
  const title = $derived(snapshot ? getGameView(snapshot.gameId).title : '')
</script>

<div class="flex size-full items-center justify-center text-center">
  <h1 class="m-0 font-display text-[140px] font-bold uppercase leading-none tracking-[0.04em]">{title || 'Dartcade'}</h1>
</div>
