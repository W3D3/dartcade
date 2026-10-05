<script lang="ts">
  import AtcProgress from './AtcProgress.svelte'
  import RollingNumber from './RollingNumber.svelte'
  import RowShell from './RowShell.svelte'
  import type { PillKind } from './pills.js'
  import type { AtcPlayerView } from '$lib/playerStats.js'
  import type { SeatLine } from '$lib/remote'

  let {
    name,
    p,
    active,
    pill,
    seat = null,
  }: { name: string; p: AtcPlayerView; active: boolean; pill: PillKind | null; seat?: SeatLine | null } = $props()
</script>

<!-- Tablets, by the row's own width: from 672 px three columns; 512 to 672 px narrower ones with
     the strip in two rows; below 512 px name, target and progress stacked -->
<RowShell
  {name}
  {active}
  {pill}
  {seat}
  class="py-4 xl:py-5 grid-cols-[190px_120px_minmax(0,1fr)] max-xl:@lg:@max-2xl:grid-cols-[140px_100px_minmax(0,1fr)] max-xl:@lg:@max-2xl:gap-3
         xl:grid-cols-[210px_150px_minmax(0,1fr)] @max-lg:grid-cols-1 @max-lg:gap-3"
>
  <span class="flex flex-col gap-1">
    <span class="text-[12px] label-caps {active ? 'text-text-muted' : 'text-text-dim'}">Target</span>
    <span class="font-display font-bold text-[min(104px,11vh)] leading-[0.85] {active ? 'text-accent' : 'text-ink-3'}"
      ><RollingNumber value={p.target} normal="up" progress={p.done} /></span
    >
  </span>

  <div class="flex flex-col gap-3 min-w-0">
    <AtcProgress
      cells={p.cells}
      {active}
      layout="strip"
      cellHeight={32}
      class="max-xl:@lg:@max-2xl:grid-cols-[repeat(11,minmax(0,1fr))]!"
    />
    <span class="flex flex-wrap gap-x-4 gap-y-1 xl:gap-6 text-[13px] xl:text-[14px] {active ? 'text-text-muted' : 'text-text-dim'}">
      <span>Darts <strong class={active ? 'text-text' : 'text-ink-2'}>{p.darts}</strong></span>
      <span>Hit rate <strong class={active ? 'text-text' : 'text-ink-2'}>{p.hitRate}</strong></span>
      <span><strong class={active ? 'text-text' : 'text-ink-2'}>{p.done}</strong> of {p.total} done</span>
    </span>
  </div>
</RowShell>
