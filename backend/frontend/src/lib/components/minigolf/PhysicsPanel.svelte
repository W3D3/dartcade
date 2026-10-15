<!--
  The minigolf bench's physics sliders. Changes apply to the next shot; Copy as JSON gives the
  values to paste into backend/src/shared/minigolf/physics.ts.
-->
<script lang="ts">
  import { DEFAULT_PHYSICS, type Physics } from '$shared/minigolf/physics'
  import { powerAt } from '$shared/minigolf/shot'

  let { physics = $bindable() }: { physics: Physics } = $props()

  type NumKey = Exclude<keyof Physics, 'step'>
  const FIELDS: { key: NumKey; label: string; min: number; max: number; step: number }[] = [
    { key: 'powerExponent', label: 'Power curve (1 = linear)', min: 1, max: 4, step: 0.1 },
    { key: 'maxRoll', label: 'Full-power roll (mm)', min: 1000, max: 10000, step: 100 },
    { key: 'minPutt', label: 'Softest putt (share of full)', min: 0, max: 0.3, step: 0.01 },
    { key: 'friction', label: 'Rolling friction (mm/s²)', min: 200, max: 4000, step: 50 },
    { key: 'cupPull', label: 'Cup pull (mm/s²)', min: 0, max: 20000, step: 500 },
    { key: 'dropTime', label: 'Drop time (s)', min: 0.01, max: 0.15, step: 0.005 },
    { key: 'restSpeed', label: 'Rest speed (mm/s)', min: 1, max: 50, step: 1 },
    { key: 'wallRestitution', label: 'Rail bounce', min: 0, max: 1, step: 0.05 },
    { key: 'bumperRestitution', label: 'Bumper bounce', min: 0, max: 1, step: 0.05 },
    { key: 'wallThickness', label: 'Rail thickness (mm)', min: 5, max: 60, step: 1 },
    { key: 'maxTime', label: 'Time cap (s)', min: 5, max: 60, step: 1 },
    { key: 'assistAngle', label: 'Aim assist window (°)', min: 0, max: 30, step: 1 },
    { key: 'assistRange', label: 'Aim assist range (mm)', min: 0, max: 3000, step: 50 },
  ]

  /** Roll on flat felt, mm, for a dart r from the bull (r = 1 at the double wire). */
  const rollAt = (r: number) => powerAt(r, physics) * physics.maxRoll
  const curve = $derived(
    Array.from({ length: 41 }, (_, i) => i / 40)
      .map(r => `${r * 100},${60 - (rollAt(r) / physics.maxRoll) * 58}`)
      .join(' '),
  )

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
  <!-- How far a putt rolls on flat felt for each distance from the bull -->
  <figure class="m-0 flex flex-col gap-1">
    <svg
      viewBox="0 0 100 60"
      preserveAspectRatio="none"
      class="h-[110px] w-full rounded-lg bg-bg-deep"
      role="img"
      aria-label="Roll distance by distance from the bull"
    >
      <polyline points={curve} fill="none" stroke="#c6f24e" stroke-width="1.5" />
      <line x1="0" y1="59.5" x2="100" y2="59.5" stroke="#2e322b" />
    </svg>
    <figcaption class="flex justify-between text-[12px] text-text-muted">
      <span>Bull</span><span>Halfway: {(rollAt(0.5) / 1000).toFixed(1)} m</span><span>Double: {(rollAt(1) / 1000).toFixed(1)} m</span>
    </figcaption>
  </figure>
  <div class="flex gap-2">
    <button type="button" class={BUTTON} onclick={() => (physics = { ...DEFAULT_PHYSICS })}>Reset</button>
    <button type="button" class={BUTTON} onclick={() => void copy()}>{copied ? 'Copied' : 'Copy as JSON'}</button>
  </div>
</section>
