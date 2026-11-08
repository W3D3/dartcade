<!-- The Coach page's leg list while it loads: its column header and `rows` rows the size of a leg's
     row (Coach.svelte), so the list doesn't jump when the legs arrive. -->
<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton'
  import { LEG_COLUMNS } from '$lib/coach/list'

  let { rows = 5 }: { rows?: number } = $props()
</script>

<div aria-hidden="true" class="hidden gap-3.5 px-3.5 pb-2.5 text-[12px] font-semibold label-caps text-text-dim lg:grid {LEG_COLUMNS}">
  <span>When</span><span>Leg</span><span class="text-right">Result</span><span class="text-right">Darts</span><span class="text-right"
    >Avg</span
  ><span>Coach found</span><span></span>
</div>
<ul aria-hidden="true" class="flex flex-col">
  {#each { length: rows }, i (i)}
    <li class="border-t border-surface-inset first:border-transparent">
      <div class="hidden items-center gap-3.5 px-3.5 py-3 lg:grid {LEG_COLUMNS}">
        <Skeleton class="h-4 w-20" />
        <span class="flex flex-col gap-1.5"><Skeleton class="h-[18px] w-3/4" /><Skeleton class="h-3.5 w-1/2" /></span>
        <Skeleton class="h-6 w-12 justify-self-end rounded-full" />
        <Skeleton class="h-6 w-8 justify-self-end" />
        <Skeleton class="h-6 w-10 justify-self-end" />
        <Skeleton class="h-6 w-32 rounded-full" />
        <Skeleton class="h-[38px] w-[104px] justify-self-end rounded-[10px]" />
      </div>
      <div class="flex flex-col gap-2 p-3 lg:hidden">
        <div class="flex items-start justify-between gap-3">
          <span class="flex flex-1 flex-col gap-1.5"><Skeleton class="h-[18px] w-1/2" /><Skeleton class="h-3.5 w-2/3" /></span>
          <Skeleton class="h-6 w-12 rounded-full" />
        </div>
        <div class="flex gap-4"><Skeleton class="h-[26px] w-16" /><Skeleton class="h-[26px] w-16" /></div>
        <div class="flex items-center justify-between gap-2">
          <Skeleton class="h-6 w-32 rounded-full" /><Skeleton class="h-[38px] w-[104px] rounded-[10px]" />
        </div>
      </div>
    </li>
  {/each}
</ul>
