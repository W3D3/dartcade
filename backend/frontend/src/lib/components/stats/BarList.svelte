<script lang="ts">
  // A ranked list of horizontal bars (Stats.dc.html: common scores, your 20s, doubles, checkout by
  // range): the name, a bar filled to `fill` (0–1), the number. `bright` bars are full lime.
  export type BarItem = { key: string; name: string; fill: number; value: string; detail?: string; bright?: boolean }

  let { items, label }: { items: BarItem[]; label: string } = $props()
</script>

<ul class="flex flex-col gap-2.5" aria-label={label}>
  {#each items as r (r.key)}
    <li class="grid grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-3">
      <span class="font-display text-[17px] font-bold">{r.name}</span>
      <span class="h-2 overflow-hidden rounded-full bg-surface-paused" aria-hidden="true">
        <span
          class="block h-full rounded-full {r.bright ? 'bg-accent' : 'bg-accent-line-strong'}"
          style:width="{Math.max(2, Math.round(r.fill * 100))}%"
        ></span>
      </span>
      <span class="min-w-[56px] text-right text-[13px] text-text-muted"
        ><span class="text-text">{r.value}</span>{#if r.detail}<span class="ml-1.5">{r.detail}</span>{/if}</span
      >
    </li>
  {/each}
</ul>
