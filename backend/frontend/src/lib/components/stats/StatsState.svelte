<script lang="ts">
  // What a stats view shows when it has no numbers: still loading (tiles and a chart, greyed),
  // nothing played yet (with a way to play), or a failed load (with a retry).
  import type { Snippet } from 'svelte'
  import { ChartColumn, CircleAlert } from '@lucide/svelte'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import { Button } from '$lib/components/ui/button'
  import EmptyState from '$lib/components/lobby/EmptyState.svelte'

  let {
    kind,
    title,
    text,
    action,
    onretry,
  }: {
    kind: 'loading' | 'empty' | 'error'
    title?: string
    text?: string
    /** Under an empty state's text: what to do next. */
    action?: Snippet
    onretry?: () => void
  } = $props()
</script>

{#if kind === 'loading'}
  <div class="flex flex-col gap-3" aria-busy="true" aria-label="Loading your stats">
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {#each { length: 5 } as _, i (i)}<Skeleton class="h-[132px] rounded-card {i === 4 ? 'max-lg:col-span-2' : ''}" />{/each}
    </div>
    <Skeleton class="h-[280px] w-full rounded-card" />
  </div>
{:else if kind === 'empty'}
  <EmptyState title={title ?? 'No stats yet'} text={text ?? 'Play a game and your numbers show up here.'} actions={action}>
    {#snippet icon()}<ChartColumn size={24} />{/snippet}
  </EmptyState>
{:else}
  <div role="alert" class="card flex max-w-[480px] flex-col items-start gap-3 px-5 py-[18px]">
    <span class="flex items-center gap-2 text-[15px] font-semibold text-danger-text"
      ><CircleAlert size={18} />{title ?? "Couldn't load your stats"}</span
    >
    <p class="text-[14px] text-text-muted">{text ?? 'Check your connection and try again.'}</p>
    {#if onretry}<Button variant="outline" class="h-9" onclick={onretry}>Try again</Button>{/if}
  </div>
{/if}
