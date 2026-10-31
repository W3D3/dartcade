<script lang="ts">
  // A card of the selected board's page: an icon and uppercase title, something on the right of the title, then its content.
  import type { Component, Snippet } from 'svelte'

  let {
    title,
    icon: Icon,
    aside,
    children,
  }: { title: string; icon: Component<{ size?: number }>; aside?: Snippet; children: Snippet } = $props()
</script>

<section aria-label={title} class="box-border p-[18px] md:p-[22px] rounded-[16px] bg-surface-panel border border-line flex flex-col gap-4">
  <div class="flex items-center gap-[10px] min-h-7">
    <span class="flex text-text-muted"><Icon size={18} /></span>
    <h3 class="m-0 font-display font-bold text-[20px] tracking-[0.04em] uppercase">{title}</h3>
    {#if aside}<span class="ml-auto flex items-center gap-[10px]">{@render aside()}</span>{/if}
  </div>
  {@render children()}
</section>
