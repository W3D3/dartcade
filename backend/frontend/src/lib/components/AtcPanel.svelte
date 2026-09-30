<script lang="ts">
  import PanelShell from './PanelShell.svelte'
  import AtcProgress from './AtcProgress.svelte'
  import type { PillKind } from './PlayerPill.svelte'
  import type { AtcPlayerView } from '$lib/playerStats.js'

  let { name, p, active, solo = false, pill }: {
    name: string
    p: AtcPlayerView
    active: boolean
    solo?: boolean
    pill: PillKind | null
  } = $props()
</script>

<PanelShell {name} {active} {solo} {pill} pillInRow>
  <div class="flex flex-col gap-[6px]">
    <span class="text-[12px] uppercase tracking-[0.1em] {active ? 'text-text-muted' : 'text-text-dim'}">Target</span>
    <span class="font-display font-bold text-[min(220px,24vh)] leading-[0.8] tracking-[-0.02em]
                 {active ? 'text-accent' : 'text-ink-3'}">{p.target}</span>
  </div>

  <div class="flex flex-col gap-[10px]">
    <span class="text-[13px] text-text-muted">
      <strong class="{active ? 'text-text' : 'text-ink-2'}">{p.done}</strong> of {p.total} done
    </span>
    <AtcProgress cells={p.cells} {active} cellHeight={solo ? 44 : 36} />
  </div>

  <div class="mt-auto flex gap-7 text-[15px] text-text-muted">
    <span>Darts <strong class="{active ? 'text-text' : 'text-ink-2'}">{p.darts}</strong></span>
    <span>Hit rate <strong class="{active ? 'text-text' : 'text-ink-2'}">{p.hitRate}</strong></span>
  </div>
</PanelShell>
