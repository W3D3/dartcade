<script lang="ts">
  // − N unit +: a whole number with a floor (legs, rounds).
  let { value, min = 1, label, unit, highlight = false, onchange }: {
    value: number
    min?: number
    /** What it counts, for the buttons' names: "legs" → "Fewer legs", "More legs". */
    label: string
    /** Shown after the number: n => n === 1 ? 'leg' : 'legs'. */
    unit?: (n: number) => string
    /** Not the default: the number turns lime. */
    highlight?: boolean
    onchange: (n: number) => void
  } = $props()
  const step = 'w-11 h-11 border border-line-3 rounded-[8px] bg-transparent text-text text-[20px] cursor-pointer font-[inherit]'
</script>

<div class="flex items-center gap-1">
  <button type="button" aria-label="Fewer {label}" onclick={() => onchange(Math.max(min, value - 1))} class={step}>−</button>
  <span class="w-12 md:w-[72px] text-center text-[15px]">
    <strong class="font-display text-[24px] {highlight ? 'text-accent' : ''}">{value}</strong>{#if unit} {unit(value)}{/if}
  </span>
  <button type="button" aria-label="More {label}" onclick={() => onchange(value + 1)} class={step}>+</button>
</div>
