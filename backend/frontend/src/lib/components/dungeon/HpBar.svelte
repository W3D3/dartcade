<script lang="ts">
  // A hero's HP bar (3px corners, as the artboards), in their class's colour or HP red. `gain` is HP
  // about to come back (a rest's heal): a striped green stretch after the current HP.
  let {
    hp,
    maxHp,
    colour = 'var(--color-dg-hp)',
    gain = 0,
    tall = false,
    class: className = '',
  }: { hp: number; maxHp: number; colour?: string; gain?: number; tall?: boolean; class?: string } = $props()
  const pct = (n: number) => (maxHp > 0 ? Math.min(100, (100 * n) / maxHp) : 0)
</script>

<div
  class="relative overflow-hidden rounded-[3px] {tall ? 'h-3.5 bg-dg-hp/15' : 'h-2.5 bg-dg-bg'} {className}"
  role="meter"
  aria-label="HP"
  aria-valuemin={0}
  aria-valuemax={maxHp}
  aria-valuenow={hp}
>
  {#if gain > 0}
    <div
      class="absolute inset-y-0 left-0 rounded-[3px] bg-[repeating-linear-gradient(135deg,var(--color-dg-heal)_0_4px,#2f7a45_4px_8px)]"
      style:width="{pct(hp + gain)}%"
    ></div>
  {/if}
  <div class="absolute inset-y-0 left-0 rounded-[3px]" style:width="{pct(hp)}%" style:background={colour}></div>
</div>
