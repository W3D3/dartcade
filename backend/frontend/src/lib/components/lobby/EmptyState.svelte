<script lang="ts">
  // Nothing to show yet: an optional icon, a title, a line of help, and what to do next.
  import type { Snippet } from 'svelte'

  let { title, text, icon, actions }: { title: string; text: string; icon?: Snippet; actions?: Snippet } = $props()
</script>

<div class="flex flex-col items-start gap-3 max-w-[480px]">
  {#if icon}<span class="size-14 rounded-full bg-surface-row text-text-muted flex items-center justify-center">{@render icon()}</span>{/if}
  <h2 class="font-display font-bold text-[30px] md:text-[34px] uppercase leading-none">{title}</h2>
  <p class="text-[15px] leading-[1.45] text-text-muted">{text}</p>
  {#if actions}<div class="flex flex-wrap gap-2">{@render actions()}</div>{/if}
</div>
