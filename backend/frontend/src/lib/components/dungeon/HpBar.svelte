<script lang="ts">
  // A hero's or enemy's HP bar (3px corners, as the artboards), in their class's colour or HP red.
  // `gain` is HP about to come back (a rest's heal): a striped green stretch after the current HP.
  // `before` is HP a visit just took (Dungeon-Pixel-Battle's front enemy): a striped gold stretch.
  // `tall` is the 14px bar of the battle plates and the rest.
  let {
    hp,
    maxHp,
    colour = 'var(--color-dg-hp)',
    gain = 0,
    before = null,
    tall = false,
    class: className = '',
  }: { hp: number; maxHp: number; colour?: string; gain?: number; before?: number | null; tall?: boolean; class?: string } = $props()
  const pct = (n: number) => (maxHp > 0 ? Math.min(100, (100 * Math.max(0, n)) / maxHp) : 0)
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
  {#if before !== null && before > hp}
    <div
      class="absolute inset-y-0 left-0 rounded-[3px] bg-[repeating-linear-gradient(135deg,var(--color-dg-gold)_0_4px,#6a5418_4px_8px)]"
      style:width="{pct(before)}%"
    ></div>
  {/if}
  <div
    class="absolute inset-y-0 left-0 rounded-[3px] transition-[width] duration-300 motion-reduce:transition-none"
    style:width="{pct(hp)}%"
    style:background={colour}
  ></div>
</div>
