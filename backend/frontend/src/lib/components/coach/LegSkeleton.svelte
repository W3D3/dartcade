<!-- A leg review while it loads (CoachLeg.svelte): the header (under `breadcrumb`, where the loaded
     page has it), the coach's take, the visit list and, from xl, the board in the right rail, each
     about the size it will be. -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { Skeleton } from '$lib/components/ui/skeleton'

  let { breadcrumb }: { breadcrumb: Snippet } = $props()
</script>

<div aria-busy="true" class="flex flex-col gap-4 md:gap-[22px]">
  <p role="status" class="sr-only">Loading the leg's review…</p>
  <div class="flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
    <div class="flex flex-col gap-1.5">
      {@render breadcrumb()}
      <Skeleton class="h-[30px] w-56 xl:h-[44px] xl:w-80" />
      <Skeleton class="h-4 w-72 max-w-full xl:w-96" />
      <Skeleton class="h-4 w-44" />
    </div>
    <Skeleton class="h-11 w-36 rounded-md" />
  </div>

  <div class="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(380px,40%)] xl:items-start xl:gap-5">
    <div class="flex min-w-0 flex-col gap-4">
      <!-- The coach's take: three skill cards and the text on phones, one card from xl -->
      <div class="flex flex-col gap-3 xl:hidden">
        <div class="grid grid-cols-3 gap-2">
          {#each [0, 1, 2] as i (i)}<div class="card flex flex-col gap-1 p-3">
              <Skeleton class="h-[30px] w-7" /><Skeleton class="h-3.5 w-14" />
            </div>{/each}
        </div>
        <Skeleton class="h-4 w-full" /><Skeleton class="h-4 w-2/3" />
      </div>
      <div class="card hidden flex-col gap-1.5 px-[22px] py-5 xl:flex">
        <Skeleton class="h-3.5 w-28" />
        <div class="mt-1 mb-2 flex flex-col gap-2"><Skeleton class="h-5 w-full" /><Skeleton class="h-5 w-3/4" /></div>
        {#each [0, 1, 2] as i (i)}
          <div class="flex items-center gap-3.5 border-t border-surface-paused py-3">
            <Skeleton class="size-11 flex-none rounded-md" />
            <span class="flex flex-1 flex-col gap-1.5"><Skeleton class="h-4 w-32" /><Skeleton class="h-3.5 w-2/3" /></span>
          </div>
        {/each}
      </div>

      <!-- Every visit -->
      <div class="flex flex-col gap-2.5 xl:card xl:px-[22px] xl:py-5">
        <Skeleton class="hidden h-6 w-40 xl:block" />
        <div class="flex gap-1.5 xl:gap-2">
          {#each ['w-[58px]', 'w-[72px]', 'w-[60px]', 'w-[80px]'] as w (w)}<Skeleton class="h-8 rounded-full {w}" />{/each}
        </div>
        {#each [0, 1, 2, 3, 4, 5] as i (i)}<Skeleton class="h-[62px] w-full rounded-lg" />{/each}
      </div>
    </div>

    <!-- The selected visit on the board, from xl -->
    <div class="card hidden flex-col gap-3.5 px-[22px] py-5 xl:flex">
      <div class="flex items-baseline justify-between"><Skeleton class="h-5 w-36" /><Skeleton class="h-6 w-16 rounded-full" /></div>
      <Skeleton class="mx-auto aspect-square w-full max-w-[420px] rounded-full" />
      <Skeleton class="h-4 w-full" /><Skeleton class="h-4 w-1/2" />
    </div>
  </div>
</div>
