<script lang="ts">
  import type { Who } from '$lib/face'
  // An Around the Clock player of three or more in the portrait layout, X01Card's counterpart: the
  // target with darts and hit rate beside it, then the progress strip.
  import PanelShell from './PanelShell.svelte'
  import AtcProgress from './AtcProgress.svelte'
  import RollingNumber from './RollingNumber.svelte'
  import type { PillKind } from './pills.js'
  import type { AtcPlayerView } from '$lib/playerStats.js'
  import type { SeatLine } from '$lib/remote'

  let {
    who,
    p,
    active,
    pill,
    seat = null,
  }: {
    who: Who
    p: AtcPlayerView
    active: boolean
    pill: PillKind | null
    seat?: SeatLine | null
  } = $props()

  const stats = $derived([
    { label: 'Done', value: `${p.done}/${p.total}` },
    { label: 'Darts', value: String(p.darts) },
    { label: 'Hit rate', value: p.hitRate },
  ])
</script>

<PanelShell {who} {active} portrait {pill} {seat} pillInRow>
  <div class="flex items-end justify-between gap-3 min-w-0">
    <span class="font-display font-bold text-[min(30cqi,9vh)] leading-[0.82] tracking-[-0.02em] {active ? 'text-accent' : 'text-ink-3'}"
      ><RollingNumber value={p.target} normal="up" progress={p.done} /></span
    >
    <span class="flex gap-4 lg:gap-[18px] pb-1">
      {#each stats as s (s.label)}
        <span class="flex flex-col gap-[3px]">
          <span class="text-[10px] label-caps whitespace-nowrap {active ? 'text-text-muted' : 'text-text-dim'}">{s.label}</span>
          <span class="font-display font-bold text-[22px] lg:text-[30px] leading-none tabular-nums {active ? 'text-text' : 'text-ink-2'}"
            >{s.value}</span
          >
        </span>
      {/each}
    </span>
  </div>
  <AtcProgress cells={p.cells} {active} layout="strip" cellHeight={24} />
</PanelShell>
