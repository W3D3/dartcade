<script lang="ts">
  let { total, won, active }: { total: number; won: number; active: boolean } = $props()
</script>

<span class="flex gap-[6px]" role="img" aria-label="{won} {won === 1 ? 'leg' : 'legs'} won">
  {#each Array.from({ length: total }) as _, i (i)}
    <span
      class="w-3 h-3 rounded-full box-border
                 {i < won ? (active ? 'bg-accent' : 'bg-text-muted') : 'border-[1.5px] border-line-pip'}"
    ></span>
  {/each}
</span>
