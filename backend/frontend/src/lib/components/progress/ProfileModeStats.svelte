<script lang="ts">
  // The profile's Stats tab content: one card for each mode the player has finished a game in, the
  // most played first (no artboard; styled like the other profile cards).
  import { hrefs } from '$lib/routes'
  import { flag } from '$lib/flags'
  import { gameTitle } from '$shared/gameNames'
  import { seeAllStats, tileValue, type ModeStatsBlock } from '$lib/profile/modeStats'

  let { modes, self }: { modes: ModeStatsBlock[]; self: boolean } = $props()
  const statsOn = flag('stats.enabled')
</script>

{#if modes.length}
  <section aria-label="Game stats" class="flex flex-col gap-4 md:gap-6">
    {#each modes as m (m.mode)}
      <article aria-label="{gameTitle(m.mode)} stats" class="card box-border flex flex-col gap-3 p-[18px] md:p-[22px]">
        <div class="flex items-center gap-3">
          <h2 class="min-w-0 flex-1 truncate font-display text-[20px] font-bold uppercase tracking-title">{gameTitle(m.mode)}</h2>
          <span class="text-small text-text-muted tabular-nums">{m.games} {m.games === 1 ? 'game' : 'games'}</span>
        </div>
        <dl class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {#each m.tiles as t (t.id)}
            <div class="flex flex-col gap-1 rounded-lg bg-surface-inset px-4 py-3">
              <dt class="text-caption text-text-muted">{t.label}</dt>
              <dd class="font-display text-[28px] font-bold leading-none tabular-nums">{tileValue(t)}</dd>
            </div>
          {/each}
        </dl>
        {#if seeAllStats(m.mode, self, $statsOn)}
          <a href={hrefs.stats()} class="self-start text-small font-semibold text-accent no-underline">See all stats</a>
        {/if}
      </article>
    {/each}
  </section>
{/if}
