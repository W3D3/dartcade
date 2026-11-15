<script lang="ts">
  // The Players tab of a running tournament (the live page, tournament mode): every entry by seed,
  // withdrawn ones last and dimmed, with its place or record so far.
  import Avatar from '$lib/components/Avatar.svelte'
  import { ordinal } from '$lib/fmt'
  import { faceOf, recordOf, type LiveEntry, type LiveMessage } from '$lib/tournaments/live'

  let { m, mine = null }: { m: LiveMessage; mine?: string | null } = $props()

  const players = $derived(
    [...m.entries].sort(
      (a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity) || Number(a.status === 'withdrawn') - Number(b.status === 'withdrawn'),
    ),
  )
  function standing(e: LiveEntry): string {
    if (e.finalPlace !== null) return `${ordinal(e.finalPlace)} place`
    if (e.status === 'withdrawn') return 'Withdrawn'
    if (m.matches.length === 0) return e.status === 'checked_in' ? 'Checked in' : 'Registered'
    const r = recordOf(m, e.id)
    return `${r.won}–${r.lost}`
  }
</script>

<section class="card flex flex-col p-2 md:p-3" aria-label="Players">
  {#each players as e (e.id)}
    <div
      class="flex items-center gap-3 rounded-md px-2 py-2.5 {e.id === mine ? 'bg-surface-picked' : ''} {e.status === 'withdrawn'
        ? 'text-text-dim'
        : ''}"
    >
      <span class="w-7 text-right type-mono-sm text-text-muted">{e.seed ?? ''}</span>
      <Avatar name={e.name} face={faceOf(e)} size={28} />
      <span class="min-w-0 grow truncate text-label font-medium">{e.name}{e.id === mine ? ' (you)' : ''}</span>
      <span class="text-small text-text-muted">{standing(e)}</span>
    </div>
  {:else}
    <p class="p-3 text-body text-text-muted">Nobody has registered yet.</p>
  {/each}
</section>
