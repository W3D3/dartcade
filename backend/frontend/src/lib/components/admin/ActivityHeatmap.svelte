<script lang="ts">
  // The weekday-by-hour grid of the Activity page with titled axes, a legend and a click on a cell for the
  // games behind it. Cells are buttons, so the grid is reachable from the keyboard.
  import { formatCount, heatLevel } from '$lib/admin/activity'

  let { grid, onpick }: { grid: number[][]; onpick: (dow: number, hour: number) => void } = $props()

  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const HEAT = ['bg-surface-inset', 'bg-accent/20', 'bg-accent/40', 'bg-accent/70', 'bg-accent']
  const peak = $derived(Math.max(0, ...grid.flat()))
  const hours = Array.from({ length: 24 }, (_, h) => h)
</script>

<div class="flex flex-col gap-2">
  <div class="overflow-x-auto">
    <div class="flex gap-2">
      <span class="self-center text-caption text-text-muted [writing-mode:vertical-rl] rotate-180">Weekday</span>
      <div
        class="flex-1 grid gap-0.5"
        style:grid-template-columns="auto repeat(24, minmax(0, 1fr))"
        role="group"
        aria-label="Games by weekday and hour"
      >
        <span></span>
        {#each hours as h (h)}
          <span class="text-center text-caption text-text-dim">{h % 3 === 0 ? h : ''}</span>
        {/each}
        {#each grid as row, d (d)}
          <span class="pr-2 text-caption text-text-muted">{WEEKDAYS[d]}</span>
          {#each row as n, h (h)}
            <button
              type="button"
              class="h-6 rounded-xs {HEAT[heatLevel(n, peak)]} hover:outline hover:outline-accent"
              title="{WEEKDAYS[d]} {h}:00 · {formatCount(n)} games"
              aria-label="{WEEKDAYS[d]} {h}:00, {n} games"
              onclick={() => onpick(d + 1, h)}
            ></button>
          {/each}
        {/each}
      </div>
    </div>
    <p class="mt-1 text-center text-caption text-text-muted">Hour of day (UTC)</p>
  </div>
  <div class="flex items-center gap-2 text-caption text-text-muted" aria-label="Legend: fewer to more games">
    Fewer
    {#each HEAT as c (c)}<span class="size-3 rounded-xs {c} border border-line"></span>{/each}
    More
  </div>
</div>
