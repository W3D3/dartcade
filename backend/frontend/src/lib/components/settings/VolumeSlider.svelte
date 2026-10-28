<script lang="ts">
  // The game settings' volume (0–1) as a slider with its percentage. Sounds and the caller share it.
  import { Slider } from '$lib/components/ui/slider/index.js'

  let { value = $bindable(), label = 'Volume' }: { value: number; label?: string } = $props()
</script>

<div class="flex items-center gap-3 md:gap-4">
  <span class="text-[15px] shrink-0 w-28">{label}</span>
  <Slider value={Math.round(value * 100)} step={5} onchange={v => (value = v / 100)} {label} class="flex-1 min-w-0" />
  <span class="font-mono text-[13px] text-text-muted w-11 text-right">{Math.round(value * 100)}%</span>
</div>
