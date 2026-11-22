<!--
  Catch 40's session panel: total, checkouts, the target ladder, the viewer's best total ever.
-->
<script lang="ts">
  import type { Catch40Game } from '$lib/api/game-ws'
  import Catch40Ladder from '$lib/components/catch40/Catch40Ladder.svelte'
  import PracticeSessionPanel from '$lib/components/practice/PracticeSessionPanel.svelte'
  import { TARGETS } from '$lib/catch40/view'

  let { game, seat }: { game: Catch40Game; seat: number } = $props()

  const s = $derived(game.seats[seat])
  const made = $derived(s.tries.filter(t => t.finish !== null).length)
</script>

<PracticeSessionPanel count="{s.tries.length} of {TARGETS}" mode="catch40" stat="total" bestLabel="Best total ever" ladderLabel="Targets">
  {#snippet stats()}
    <div class="grid grid-cols-2 gap-3">
      {#each [{ k: 'Total', v: `${s.total}/120` }, { k: 'Checkouts', v: `${made}/${s.tries.length}` }] as stat (stat.k)}
        <div class="flex flex-col gap-1">
          <span class="text-caption font-semibold label-caps text-text-dim">{stat.k}</span>
          <span class="type-checkout font-bold leading-none">{stat.v}</span>
        </div>
      {/each}
    </div>
  {/snippet}
  {#snippet ladder()}<Catch40Ladder {game} {seat} variant="list" />{/snippet}
</PracticeSessionPanel>
