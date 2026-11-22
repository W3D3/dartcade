<!--
  The open visit under the board: the round and the number it aims at, the single, double and treble
  of it as three chips that light up as they land (a Shanghai is all three), and the visit's score.
-->
<script lang="ts">
  import type { ShanghaiGame } from '$lib/api/game-ws'
  import { BULL } from '$shared/shanghai'
  import { kindLabel, kindsOf, roundLabel, targetLabel } from '$lib/shanghai/view'

  let { game }: { game: ShanghaiGame } = $props()
  const kinds = $derived(kindsOf(game.target))
  const bull = $derived(game.target === BULL)
  const done = $derived(kinds.every(k => game.hits[k]) && !bull)
</script>

<div role="status" class="shrink-0 box-border px-4 py-3 flex items-center gap-4 card {done ? 'border-2 border-accent' : ''}">
  <span class="flex flex-col min-w-0">
    <span class="text-caption label-caps text-text-muted">{roundLabel(game)}</span>
    <span class="font-display font-bold text-4xl leading-none text-accent">{targetLabel(game.target)}</span>
  </span>
  <ul class="flex gap-2 mx-auto" aria-label="This visit">
    {#each kinds as k (k)}
      {@const hit = game.hits[k]}
      <li
        class="min-w-[52px] h-11 px-2 flex items-center justify-center rounded-chip font-display font-bold text-xl
               {hit ? 'bg-accent text-accent-fg' : 'border border-dashed border-line-dashed text-text-dim'}"
        aria-label="{k}: {hit ? 'hit' : 'not yet'}"
      >
        {bull ? (k === 'single' ? '25' : '50') : kindLabel(k, game.target)}
      </li>
    {/each}
  </ul>
  <span class="flex flex-col items-end shrink-0">
    <span class="text-caption label-caps text-text-muted">{done && game.cfg.shanghaiWins ? 'Shanghai' : 'This visit'}</span>
    <span class="font-display font-bold text-4xl leading-none">{game.visitScore}</span>
  </span>
</div>
