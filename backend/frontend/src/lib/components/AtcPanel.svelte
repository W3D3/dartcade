<script lang="ts">
  import PanelShell from './PanelShell.svelte'
  import AtcProgress from './AtcProgress.svelte'
  import RollingNumber from './RollingNumber.svelte'
  import type { PillKind } from './pills.js'
  import type { AtcPlayerView } from '$lib/playerStats.js'
  import type { SeatLine } from '$lib/remote'
  import type { Snippet } from 'svelte'

  let {
    name,
    p,
    active,
    solo = false,
    pill,
    seat = null,
    waiting,
  }: {
    name: string
    p: AtcPlayerView
    active: boolean
    solo?: boolean
    pill: PillKind | null
    seat?: SeatLine | null
    waiting?: Snippet
  } = $props()
</script>

<PanelShell {name} {active} {solo} {pill} {seat} {waiting} pillInRow>
  <div class="flex flex-col gap-[6px]">
    <span class="text-[12px] uppercase tracking-[0.1em] {active ? 'text-text-muted' : 'text-text-dim'}">Target</span>
    <span
      class="font-display font-bold {solo
        ? 'text-[min(220px,24vh)]'
        : 'text-[min(150px,24vh,56cqi)] xl:text-[min(220px,24vh)]'} leading-[0.8] tracking-[-0.02em]
                 {active ? 'text-accent' : 'text-ink-3'}"><RollingNumber value={p.target} normal="up" progress={p.done} /></span
    >
  </div>

  <div class="flex flex-col gap-[10px]">
    <span class="text-[13px] text-text-muted">
      <strong class={active ? 'text-text' : 'text-ink-2'}>{p.done}</strong> of {p.total} done
    </span>
    <AtcProgress cells={p.cells} {active} cellHeight={solo ? 44 : 36} />
  </div>

  <div class="mt-auto flex gap-7 text-[15px] text-text-muted">
    <span>Darts <strong class={active ? 'text-text' : 'text-ink-2'}>{p.darts}</strong></span>
    <span>Hit rate <strong class={active ? 'text-text' : 'text-ink-2'}>{p.hitRate}</strong></span>
  </div>
</PanelShell>
