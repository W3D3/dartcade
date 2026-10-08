<script lang="ts">
  // A titled card on the lobby screens: the title, a note on the right, the content.
  import type { Snippet } from 'svelte'

  let {
    title,
    label,
    flat = false,
    note,
    children,
    class: className = '',
  }: {
    title: string
    /** Accessible name of the section (default: the title). */
    label?: string
    /** No card on phones (the people list sits on the page there). */
    flat?: boolean
    note?: Snippet
    children: Snippet
    class?: string
  } = $props()
</script>

<section
  aria-label={label ?? title}
  class="flex flex-col gap-[10px] md:gap-[14px] min-h-0 box-border
         {flat ? 'md:p-5 md:card' : 'p-4 md:p-5 card'} {className}"
>
  <div class="flex justify-between items-baseline gap-3">
    <h2 class="m-0 text-[15px] md:text-[17px] font-semibold">{title}</h2>
    {#if note}<span class="text-[12px] md:text-[13px] text-text-muted text-right">{@render note()}</span>{/if}
  </div>
  {@render children()}
</section>
