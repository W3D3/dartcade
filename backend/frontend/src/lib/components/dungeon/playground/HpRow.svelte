<!-- An HP bar with its numbers, drawn by the game's own HpBar. -->
<script lang="ts">
  import HpBar from '../HpBar.svelte'

  let { hp, maxHp, colour }: { hp: number; maxHp: number; colour?: string } = $props()
</script>

<div class="flex items-center gap-2 text-xs text-text-muted">
  <HpBar {hp} {maxHp} {colour} class="min-w-0 grow" />
  <span class="tabular-nums">{hp}/{maxHp}</span>
</div>
