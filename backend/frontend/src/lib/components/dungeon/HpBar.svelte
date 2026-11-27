<script lang="ts">
  // A hero's HP bar (3px corners, as the artboards), in their class's colour or HP red
  let {
    hp,
    maxHp,
    colour = 'var(--color-dg-hp)',
    class: className = '',
  }: { hp: number; maxHp: number; colour?: string; class?: string } = $props()
</script>

<div
  class="h-2.5 overflow-hidden rounded-[3px] bg-dg-bg {className}"
  role="meter"
  aria-label="HP"
  aria-valuemin={0}
  aria-valuemax={maxHp}
  aria-valuenow={hp}
>
  <div class="h-full rounded-[3px]" style:width="{maxHp > 0 ? (100 * hp) / maxHp : 0}%" style:background={colour}></div>
</div>
