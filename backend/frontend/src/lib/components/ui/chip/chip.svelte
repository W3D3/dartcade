<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    selected = false,
    onclick,
    children,
  }: {
    selected?: boolean
    onclick?: () => void
    children: Snippet
  } = $props()
</script>

<button
  type="button"
  {onclick}
  aria-pressed={selected}
  class="px-3 py-1 rounded-full text-[13px] border transition-colors
         {selected ? 'border-accent text-accent bg-accent/10' : 'border-line-2 text-text-muted hover:border-line-3'}"
>
  {@render children()}
</button>
