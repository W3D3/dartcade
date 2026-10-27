<script lang="ts">
  // The frame of a seat on the big screen: a card, or a row in the party layout. The thrower's is outlined in the accent.
  import type { Snippet } from 'svelte'

  let { active, variant, label, children }: { active: boolean; variant: 'card' | 'row'; label: string; children: Snippet } = $props()
</script>

<section
  aria-label={label}
  class="box-border flex min-h-0 min-w-0 flex-1 basis-0 flex-col {variant === 'card'
    ? 'justify-between gap-4 rounded-[28px] p-8'
    : 'justify-center gap-3 rounded-[22px] px-[30px]'} {active
    ? 'border-4 border-accent bg-card-active'
    : 'border-2 border-line bg-surface-1'}"
>
  {@render children()}
</section>
