<!--
  The minigolf bench's physics sliders. Changes apply to the next shot; Copy as JSON gives the
  values to paste into backend/src/shared/minigolf/physics.ts.
-->
<script lang="ts">
  import { DEFAULT_PHYSICS, type Physics } from '$shared/minigolf/physics'

  let { physics = $bindable() }: { physics: Physics } = $props()

  type NumKey = Exclude<keyof Physics, 'powerCurve' | 'step'>
  const FIELDS: { key: NumKey; label: string; min: number; max: number; step: number }[] = [
    { key: 'maxRoll', label: 'Full-power roll (mm)', min: 1000, max: 10000, step: 100 },
    { key: 'minPutt', label: 'Softest putt (share of full)', min: 0, max: 0.3, step: 0.01 },
    { key: 'friction', label: 'Rolling friction (mm/s²)', min: 200, max: 4000, step: 50 },
    { key: 'captureSpeed', label: 'Cup capture speed (mm/s)', min: 200, max: 3000, step: 50 },
    { key: 'restSpeed', label: 'Rest speed (mm/s)', min: 1, max: 50, step: 1 },
    { key: 'wallRestitution', label: 'Rail bounce', min: 0, max: 1, step: 0.05 },
    { key: 'bumperRestitution', label: 'Bumper bounce', min: 0, max: 1, step: 0.05 },
    { key: 'wallThickness', label: 'Rail thickness (mm)', min: 5, max: 60, step: 1 },
    { key: 'maxTime', label: 'Time cap (s)', min: 5, max: 60, step: 1 },
  ]

  let copied = $state(false)
  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(JSON.stringify(physics, null, 2))
    copied = true
    setTimeout(() => (copied = false), 2000)
  }

  const BUTTON =
    'h-9 rounded-[10px] border border-line-2 bg-surface-2 px-3 text-text text-[14px] font-medium font-[inherit] cursor-pointer hover:bg-surface-hover'
</script>

<section class="flex flex-col gap-3" aria-label="Physics">
  {#each FIELDS as f (f.key)}
    <label class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[14px]">
      <span class="text-text-muted">{f.label}</span>
      <span class="tabular-nums {physics[f.key] !== DEFAULT_PHYSICS[f.key] ? 'text-accent' : ''}">{physics[f.key]}</span>
      <input type="range" class="col-span-2 accent-[#c6f24e]" min={f.min} max={f.max} step={f.step} bind:value={physics[f.key]} />
    </label>
  {/each}
  <label class="flex items-center justify-between gap-3 text-[14px]">
    <span class="text-text-muted">Power curve</span>
    <select bind:value={physics.powerCurve} class="h-9 rounded-[10px] border border-line-2 bg-surface-2 px-2 text-text font-[inherit]">
      <option value="linear">Linear</option>
      <option value="ease-in">Ease in (finer near the bull)</option>
    </select>
  </label>
  <div class="flex gap-2">
    <button type="button" class={BUTTON} onclick={() => (physics = { ...DEFAULT_PHYSICS })}>Reset</button>
    <button type="button" class={BUTTON} onclick={() => void copy()}>{copied ? 'Copied' : 'Copy as JSON'}</button>
  </div>
</section>
