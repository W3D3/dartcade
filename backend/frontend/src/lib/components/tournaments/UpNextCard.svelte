<script lang="ts">
  // "Up next for you" beside Browse (Tournaments board): the match being played, then your next
  // tournaments with what is open for you, and All N › to My tournaments. Hidden with nothing to show.
  import type { MyTournaments } from '$lib/api'
  import { whenParts } from '$lib/tournaments/browse'
  import { hrefs } from '$lib/routes'
  import { asLine, mineCount, statusLine, upcomingOf } from '$lib/tournaments/mine'

  let { mine }: { mine: MyTournaments } = $props()

  const rows = $derived(upcomingOf(mine).slice(0, 3))
  const live = $derived(mine.liveMatch)
</script>

{#if live || rows.length > 0}
  <section class="card flex flex-col gap-1 p-5" aria-labelledby="up-next">
    <div class="flex items-baseline justify-between">
      <h3 id="up-next" class="text-body-lg font-semibold">Up next for you</h3>
      <a href={hrefs.tournaments('mine')} class="text-small font-semibold no-underline">All {mineCount(mine)} ›</a>
    </div>
    {#if live}
      <div class="flex flex-col gap-2 border-t border-surface-paused py-3">
        <div class="flex items-center gap-2.5">
          <span class="mx-1.5 size-[9px] shrink-0 rounded-full bg-live" aria-hidden="true"></span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-label font-semibold">{live.tournament.name}</span>
            <span class="text-small text-text-muted">{live.round} vs {live.opponent} · now</span>
          </span>
        </div>
        <a
          href={hrefs.session(live.sessionId)}
          class="inline-flex h-9 w-full items-center justify-center rounded-md bg-accent text-small font-semibold text-accent-fg no-underline"
          >Join your match</a
        >
      </div>
    {/if}
    {#each rows as p (p.tournament.id)}
      {@const status = statusLine(p)}
      {@const when = whenParts(p.tournament.startsAt)}
      <div class="flex flex-col gap-2 border-t border-surface-paused py-3">
        <span class="flex min-w-0 flex-col">
          <span class="truncate text-label font-semibold">{p.tournament.name}</span>
          <span class="text-small text-text-muted">{[asLine(p), when && `${when.weekday} ${when.time}`].filter(Boolean).join(' · ')}</span>
        </span>
        {#if status.tone === 'warn'}
          <span class="rounded-md border border-warn-line bg-warn-soft px-2.5 py-2 text-small text-warn">{status.text}</span>
        {/if}
      </div>
    {/each}
  </section>
{/if}
