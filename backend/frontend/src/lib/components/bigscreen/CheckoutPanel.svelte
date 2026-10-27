<script lang="ts">
  // The finish to aim at (or the game shot): a label, a line of text and the route in big type.
  import { NUM } from '$lib/bigscreen/look'

  let {
    label,
    text,
    route = '',
    routeSize,
    danger = false,
    height = 140,
  }: { label: string; text: string; route?: string; routeSize: number; danger?: boolean; height?: number } = $props()
</script>

<div
  class="box-border flex flex-none items-center gap-[30px] rounded-3xl border-2 border-checkout-line px-9"
  style="height:{height}px;background:linear-gradient(90deg,var(--color-checkout-from),var(--color-checkout-to))"
>
  <span class="flex min-w-0 flex-1 flex-col">
    <span class="text-[28px] font-extrabold tracking-[0.14em] {danger ? 'text-live' : 'text-accent'}">{label}</span>
    <span class="text-[28px] leading-tight text-ink-2">{text}</span>
  </span>
  {#if route}
    <span class="{NUM} flex-none whitespace-nowrap leading-none tracking-[0.02em] text-accent" style="font-size:{routeSize}px">{route}</span
    >
  {/if}
</div>
