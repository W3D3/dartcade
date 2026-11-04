<!-- The Coach page under its header while the page itself (its code, the flags) loads: the Review
     tab, the four counts and the leg list, each the size it will be. -->
<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton'
  import CountCards from './CountCards.svelte'
  import LegRowsSkeleton from './LegRowsSkeleton.svelte'
</script>

<div aria-busy="true" class="flex flex-col gap-4 md:gap-[22px]">
  <p role="status" class="sr-only">Loading your coach reviews…</p>
  <div class="flex border-b border-surface-paused pb-3.5"><Skeleton class="h-7 w-44 md:h-[34px]" /></div>
  <CountCards counts={null} />
  <div class="card flex flex-col gap-3 p-4 md:px-[22px] md:py-5">
    <div class="flex flex-wrap items-center gap-2">
      {#each ['w-[74px]', 'w-[52px]', 'w-[72px]', 'w-[118px]', 'w-[96px]', 'w-[92px]'] as w (w)}<Skeleton
          class="h-8 rounded-full {w}"
        />{/each}
    </div>
    <LegRowsSkeleton />
  </div>
</div>
