<script lang="ts">
  // What the final places win (Tournaments artboard, the hero card's Prizes): place, title, XP.
  import type { TournamentSummary } from '$lib/api'
  import { placeLabel, titleName, xpLabel } from '$lib/tournaments/prizes'

  let { prizes }: { prizes: TournamentSummary['prizes'] } = $props()
</script>

{#if prizes.length > 0}
  <div class="flex flex-col gap-2.5" aria-label="Prizes">
    <span class="text-caption font-bold uppercase tracking-[.12em] text-ink-faint">Prizes</span>
    {#each prizes as p (p.from)}
      {@const title = titleName(p)}
      <div class="flex items-center gap-2.5 text-label">
        <span class="w-10 whitespace-nowrap font-display text-card-title font-bold {p.from === 1 ? 'text-gold' : 'text-ink-2'}"
          >{placeLabel(p)}</span
        >
        <span class="flex-1">
          {#if title}Title <b>{title}</b>{#if p.xp > 0}&nbsp;·&nbsp;{/if}{/if}{#if p.xp > 0}{xpLabel(p.xp)}{/if}
        </span>
      </div>
    {/each}
  </div>
{/if}
