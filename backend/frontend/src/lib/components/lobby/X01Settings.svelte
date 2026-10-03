<script lang="ts">
  // The lobby's inline X01 settings (Lobby, Lobby-Host-Phone): start score, check-out, first to.
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import Stepper from '$lib/components/Stepper.svelte'
  import Field from './Field.svelte'

  let { config, onchange }: { config: Record<string, unknown>; onchange: (key: string, value: unknown) => void } = $props()

  const STARTS = [301, 501, 701].map(v => ({ value: v, label: String(v) }))
  const OUTS = [{ value: 'straight', label: 'Straight' }, { value: 'double', label: 'Double' }, { value: 'master', label: 'Master' }]
  const legs = $derived(typeof config.firstTo === 'number' ? config.firstTo : 1)
</script>

<div class="flex flex-col gap-3 p-[14px] rounded-[12px] bg-surface-panel border border-line-2">
  <Field label="Start score"><SegmentedControl options={STARTS} value={config.startScore} onchange={(v) => onchange('startScore', v)} /></Field>
  <Field label="Check-out"><SegmentedControl options={OUTS} value={config.outMode} onchange={(v) => onchange('outMode', v)} /></Field>
  <div class="flex items-center justify-between">
    <span class="text-[13px] md:text-[14px] font-medium text-ink-soft">First to</span>
    <Stepper value={legs} label="legs" unit={(n) => (n === 1 ? 'leg' : 'legs')} onchange={(n) => onchange('firstTo', n)} />
  </div>
  <span class="text-[12px] text-text-dim">Changes show up on everyone's phone right away.</span>
</div>
