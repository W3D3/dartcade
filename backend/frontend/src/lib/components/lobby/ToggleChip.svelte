<script lang="ts">
  // A round on/off button: "In" / "Sits out", "Ready" / "Ready?", a who-plays chip.
  import type { Snippet } from 'svelte'

  let { on, onclick, label, tone = 'soft', size = 'sm', children }: {
    on: boolean
    onclick: () => void
    /** Read by screen readers instead of the visible text. */
    label?: string
    /** soft: lime tint when on, dashed when off. solid: lime when on, lime outline when off (ready). */
    tone?: 'soft' | 'solid'
    /** md: the who-plays chips, with an avatar inside. */
    size?: 'sm' | 'md'
    children: Snippet
  } = $props()

  const look = $derived(tone === 'solid'
    ? on ? 'border-0 bg-accent text-accent-fg font-bold' : 'border-[1.5px] border-solid border-accent bg-transparent text-accent font-bold'
    : on ? 'border border-solid border-[#5c7323] bg-[#2b3417] text-text font-semibold' : 'border border-dashed border-line-strong bg-transparent text-text-muted')
</script>

<button type="button" aria-pressed={on} aria-label={label} {onclick}
  class="inline-flex items-center rounded-full cursor-pointer font-[inherit] {look}
         {size === 'md' ? 'h-10 gap-2 pl-[5px] pr-3 text-[14px]' : 'h-8 gap-1 px-[10px] text-[12px]'}">
  {@render children()}
</button>
