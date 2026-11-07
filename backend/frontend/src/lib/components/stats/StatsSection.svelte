<script lang="ts">
  // One section of the Stats page (Overview, Scoring, Checkout): its heading and line, a rule above
  // every one but the first, and its cards.
  import type { Snippet } from 'svelte'

  let {
    id,
    title,
    note,
    first = false,
    children,
  }: { id: string; title: string; note: string; first?: boolean; children: Snippet } = $props()
</script>

<section
  {id}
  aria-labelledby="{id}-title"
  class="flex scroll-mt-4 flex-col gap-3 {first ? 'mt-1' : 'mt-6 border-t border-surface-paused pt-7'}"
>
  <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
    <h2 id="{id}-title" class="m-0 font-display text-[32px] font-bold uppercase tracking-[0.02em]">{title}</h2>
    <span class="text-[14px] text-text-muted">{note}</span>
  </div>
  {@render children()}
</section>
