<script lang="ts">
  // The Around the Clock thrower on a phone: name, board, pill, the current target, progress, darts and hit rate.
  import AtcProgress from './AtcProgress.svelte'
  import RollingNumber from './RollingNumber.svelte'
  import PhoneCardShell from './PhoneCardShell.svelte'
  import type { PillKind } from './pills.js'
  import type { AtcPlayerView } from '$lib/playerStats'
  import type { SeatLine } from '$lib/remote'

  let { name, p, pill, seat }: { name: string; p: AtcPlayerView; pill: PillKind | null; seat: SeatLine | null } = $props()
</script>

<PhoneCardShell {name} label="{name}, throwing, target {p.target}" {pill} {seat} class="gap-[10px]">
  <div class="flex items-end justify-between gap-3">
    <span class="flex flex-col gap-1">
      <span class="text-[10px] uppercase tracking-[0.1em] text-text-muted">Target</span>
      <span class="font-display font-bold text-[64px] [@media(min-height:741px)]:text-[96px] leading-[0.8] text-accent"
        ><RollingNumber value={p.target} normal="up" progress={p.done} /></span
      >
    </span>
    <span class="flex flex-col items-end gap-1 text-[13px] text-text-muted">
      <span><strong class="text-text">{p.done}</strong> of {p.total} done</span>
      <span>Darts <strong class="text-text">{p.darts}</strong> · Hit rate <strong class="text-text">{p.hitRate}</strong></span>
    </span>
  </div>
  <AtcProgress cells={p.cells} active layout="strip" />
</PhoneCardShell>
