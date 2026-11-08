<!-- The live coach (LiveCoach.svelte) while its code and models load: the same panel or, `compact`,
     the same one-line bar, so the match screen doesn't move when the coach arrives. -->
<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton'

  let { compact = false }: { compact?: boolean } = $props()
</script>

{#if compact}
  <div aria-busy="true" class="flex shrink-0 items-center gap-2 card px-3 py-2 text-[14px]">
    <span class="font-semibold">Coach</span>
    <span role="status" class="text-text-muted">· loading…</span>
  </div>
{:else}
  <aside
    aria-busy="true"
    aria-label="Coach"
    class="box-border flex min-h-0 w-[340px] shrink-0 flex-col gap-5 rounded-panel border border-line-2 bg-surface-panel p-6 2xl:w-[400px]"
  >
    <h2 class="font-display text-[26px] font-bold uppercase leading-none">Coach</h2>
    <p role="status" class="sr-only">Loading the coach…</p>
    <div class="flex flex-col gap-2">
      <Skeleton class="h-4 w-20" />
      {#each [0, 1, 2] as i (i)}<Skeleton class="h-10 w-full rounded-md" />{/each}
      <Skeleton class="h-3.5 w-3/4" />
    </div>
    <div class="flex flex-col gap-2">
      <Skeleton class="h-4 w-24" />
      <Skeleton class="h-4 w-28" />
    </div>
  </aside>
{/if}
