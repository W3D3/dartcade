<!-- A page's breadcrumb, big title and one line under it; tablets and desktops only (phones have the Layout's header).
     A <header> of its own, or a <div> inside a header that holds more (actions, a section nav). -->
<script lang="ts">
  import { Breadcrumb, type BreadcrumbItem } from '$lib/components/ui/breadcrumb/index.js'

  let { title, sub, trail, as = 'header' }: { title: string; sub: string; trail?: BreadcrumbItem[]; as?: 'header' | 'div' } = $props()
</script>

<svelte:element this={as} class="hidden md:flex flex-col gap-[6px]">
  {#if trail}<Breadcrumb items={trail} />{/if}
  <h1 class="m-0 font-display font-bold text-[48px] leading-none uppercase tracking-[0.02em]">{title}</h1>
  <p class="m-0 text-[15px] text-text-muted">{sub}</p>
</svelte:element>
