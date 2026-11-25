<!-- A page's or section's body while its data loads, used as the fallback (`{#if loading}<LoadingBlock />`).
     A centred indicator (or `rows` skeleton rows, for a list) that shows only after a short delay, and
     turns into "taking longer than usual" with a Retry after 12 s: `onretry` fetches again, and without it Retry reloads the page. The box keeps its height, so nothing
     jumps. -->
<script lang="ts">
  import { onDestroy } from 'svelte'
  import { Button } from '$lib/components/ui/button'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import { Spinner } from '$lib/components/ui/spinner'
  import { WaitGate, type WaitTimes } from '$lib/waitGate.svelte'
  import { cn } from '$lib/utils.js'

  let {
    label = 'Loading',
    rows = 0,
    onretry,
    times,
    class: className = '',
  }: { label?: string; rows?: number; onretry?: () => void; times?: Partial<WaitTimes>; class?: string } = $props()

  // svelte-ignore state_referenced_locally
  const gate = new WaitGate(times)
  onDestroy(() => gate.destroy())

  function retry() {
    gate.restart()
    if (onretry) onretry()
    else location.reload()
  }
</script>

<div aria-busy="true" class={cn('flex min-h-24 flex-col items-center justify-center gap-3 py-6', className)}>
  {#if gate.shown && gate.slow}
    <p role="status" class="m-0 text-body text-text-muted">This is taking longer than usual.</p>
    <Button variant="outline" size="sm" onclick={retry}>Retry</Button>
  {:else if gate.shown && rows > 0}
    <div role="status" class="flex w-full flex-col gap-3">
      <span class="sr-only">{label}</span>
      {#each Array.from({ length: rows }, (_, i) => i) as i (i)}<Skeleton class="h-10 w-full" />{/each}
    </div>
  {:else if gate.shown}
    <Spinner size="block" {label} />
  {/if}
</div>
