<script lang="ts">
  // The party: each hero's portrait, name, HP bar and class, and the gold (Dungeon-Pixel-Map).
  // `compact`: the phone's row of small cards.
  import { CircleDollarSign } from '@lucide/svelte'
  import type { DungeonGame } from '$lib/api/game-ws'
  import { CLASSES, isClassId } from '$shared/dungeon/content/classes'
  import HpBar from './HpBar.svelte'
  import PixelSprite from './PixelSprite.svelte'

  let { game, names, compact = false }: { game: DungeonGame; names: string[]; compact?: boolean } = $props()
</script>

{#if compact}
  <ul class="grid gap-2 p-0" style:grid-template-columns="repeat({game.heroes.length}, minmax(0, 1fr))" aria-label="Party">
    {#each game.heroes as h (h.seat)}
      <li class="flex min-w-0 flex-col gap-1 rounded-lg border border-dg-line bg-dg-panel p-2 {h.hp === 0 ? 'opacity-50' : ''}">
        <span class="flex items-center gap-1.5">
          {#if h.classId && isClassId(h.classId)}<PixelSprite id={h.classId} scale={1.5} />{/if}
          <span class="truncate font-display text-sm font-bold uppercase">{names[h.seat]}</span>
        </span>
        <HpBar hp={h.hp} maxHp={h.maxHp} />
        <span class="text-xs text-dg-muted">{h.hp}/{h.maxHp}</span>
      </li>
    {/each}
  </ul>
{:else}
  <section class="flex flex-col gap-2 rounded-xl border border-dg-line bg-dg-panel p-3" aria-label="Party">
    <div class="flex items-center justify-between">
      <h3 class="font-display text-lg font-bold uppercase text-dg-muted">Party</h3>
      <span class="flex items-center gap-1 text-dg-gold"><CircleDollarSign class="size-4" />{game.gold} gold</span>
    </div>
    <ul class="flex flex-col gap-2 p-0">
      {#each game.heroes as h (h.seat)}
        <li class="flex items-center gap-3 {h.hp === 0 ? 'opacity-50' : ''}">
          <span class="flex size-12 shrink-0 items-center justify-center rounded-md bg-dg-raised">
            {#if h.classId && isClassId(h.classId)}<PixelSprite id={h.classId} scale={2} />{/if}
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="flex justify-between gap-2">
              <span class="truncate font-display font-bold uppercase">{names[h.seat]}</span>
              <span class="text-sm">{h.hp}/{h.maxHp}</span>
            </span>
            <HpBar hp={h.hp} maxHp={h.maxHp} />
            <span class="text-xs text-dg-muted">{h.classId && isClassId(h.classId) ? CLASSES[h.classId].name : ''}</span>
          </span>
        </li>
      {/each}
    </ul>
  </section>
{/if}
