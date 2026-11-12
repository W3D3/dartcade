<script lang="ts">
  // One match of the live bracket (Tournament-Live): both sides with their legs, the winner lit,
  // a YOUR MATCH or LIVE tag, and Watch on a live game you are not in.
  import { Eye } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import { hrefs } from '$lib/routes'
  import { canWatch, faceOf, type LiveEntry, type LiveMatch } from '$lib/tournaments/live'

  let { match, entries, mine }: { match: LiveMatch; entries: readonly LiveEntry[]; mine: string | null } = $props()

  const yours = $derived(mine !== null && match.sides.includes(mine))
  const live = $derived(match.status === 'live')
  const watch = $derived(canWatch(match, mine))
  const finished = $derived(match.status === 'finished')
  const tag = $derived(yours && (live || match.status === 'ready') ? 'Your match' : live ? 'Live' : null)
  const sides = $derived(
    match.sides.map((id, i) => {
      const entry = entries.find(e => e.id === id) ?? null
      return {
        entry,
        face: faceOf(entry),
        // A bye's empty side, else a place still to be decided
        label: entry?.name ?? (match.outcome === 'bye' ? 'Bye' : 'TBD'),
        won: finished && match.winner === i,
        lost: finished && match.winner !== null && match.winner !== i,
        legs: match.status === 'pending' || match.outcome === 'bye' ? '' : String(match.legs[i]),
      }
    }),
  )
  const names = $derived(sides.map(s => s.label).join(' vs '))
</script>

<div
  class="relative w-[190px] shrink-0 rounded-lg bg-surface-panel
         {yours && match.status !== 'finished' ? 'border-2 border-live' : live ? 'border border-live/40' : 'border border-line-2'}"
  data-testid="bracket-match"
  aria-label={names}
>
  {#if tag}
    <span
      class="absolute -top-2.5 left-2.5 inline-flex h-5 items-center gap-1.5 rounded-pill bg-live px-2 type-pill text-caption font-bold text-bg"
    >
      <span class="size-1.5 animate-pulse rounded-full bg-bg motion-reduce:animate-none"></span>{tag}
    </span>
  {/if}
  {#if watch && match.game}
    <a
      href={hrefs.watch(match.game.sessionId)}
      aria-label="Watch {names}"
      class="absolute -top-3 right-2.5 inline-flex h-6 items-center gap-1 rounded-pill border border-accent bg-surface-panel px-2 text-caption font-bold text-accent no-underline hover:bg-surface-hover"
      ><Eye size={13} aria-hidden="true" />Watch</a
    >
  {/if}
  <div class="overflow-hidden rounded-[11px]">
    {#each sides as s, i (i)}
      {#if i === 1}<div class="h-px bg-surface-paused"></div>{/if}
      <div class="flex h-10 items-center gap-2.5 px-3 {s.won ? 'bg-surface-picked' : ''}">
        {#if s.entry}<Avatar name={s.entry.name} face={s.face} size={24} />{/if}
        <span
          class="min-w-0 flex-1 truncate text-label
                 {s.won ? 'font-semibold text-text' : s.lost ? 'font-medium text-text-dim' : 'font-medium text-text'}">{s.label}</span
        >
        <span class="font-display text-body-lg font-bold {s.won ? 'text-accent' : s.lost ? 'text-text-dim' : 'text-text'}">{s.legs}</span>
      </div>
    {/each}
  </div>
</div>
