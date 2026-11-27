<script lang="ts">
  // The act's map (Dungeon-Pixel-Map): floor 1 at the bottom, the boss on top, round rooms joined by
  // paths that only go up. The path taken is gold, the ways up are dashed gold, rooms passed by fade.
  import type { DungeonGame } from '$lib/api/game-ws'
  import { mapLayout, ROOMS, type MapNode } from '$lib/dungeon/view'
  import { isClassId } from '$shared/dungeon/content/classes'
  import PixelSprite from './PixelSprite.svelte'

  let { game }: { game: DungeonGame } = $props()
  const layout = $derived(mapLayout(game))
  // Room for the boss's ring on top and the party's sprites under floor 1
  const pad = (v: number) => 7 + v * 86
  const tone = (n: MapNode) =>
    n.state === 'here'
      ? 'border-dg-gold bg-dg-raised text-dg-gold ring-4 ring-dg-gold/30'
      : n.state === 'next'
        ? 'border-dg-gold border-dashed bg-dg-panel text-dg-gold'
        : n.state === 'taken'
          ? 'border-dg-gold/60 bg-dg-panel text-dg-gold/70'
          : n.state === 'missed'
            ? 'border-dg-dashed border-dashed bg-dg-bg text-dg-dim opacity-50'
            : n.type === 'boss'
              ? 'border-dg-hp bg-dg-panel text-dg-hp'
              : 'border-dg-line bg-dg-panel text-dg-muted'
  const edgeTone = ([a, b]: [MapNode, MapNode]) =>
    (a.state === 'taken' || a.state === 'here') && (b.state === 'taken' || b.state === 'here')
      ? { stroke: 'var(--color-dg-gold)', dash: undefined, width: 0.9 }
      : a.state === 'here' && b.state === 'next'
        ? { stroke: 'var(--color-dg-gold)', dash: '1.6 1.2', width: 0.9 }
        : { stroke: 'var(--color-dg-line)', dash: '1.2 1.4', width: 0.5 }
</script>

<div class="relative size-full min-h-80" role="img" aria-label="Map: floor {game.floor} of {game.floors}">
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="absolute inset-0 size-full" aria-hidden="true">
    {#each layout.edges as e (`${e[0].floor}-${e[0].lane}-${e[1].lane}`)}
      {@const t = edgeTone(e)}
      <line
        x1={pad(e[0].x)}
        y1={pad(e[0].y)}
        x2={pad(e[1].x)}
        y2={pad(e[1].y)}
        stroke={t.stroke}
        stroke-width={t.width}
        stroke-dasharray={t.dash}
        vector-effect="non-scaling-stroke"
        style:stroke-width="{t.width * 3}px"
      />
    {/each}
  </svg>
  {#each Array.from({ length: game.floors }, (_, i) => i + 1) as f (f)}
    <span
      class="absolute left-0 -translate-y-1/2 font-display text-sm text-dg-dim"
      style:top="{pad(1 - (f - 1) / Math.max(1, game.floors - 1))}%">{f}</span
    >
  {/each}
  {#each layout.nodes as n (`${n.floor}-${n.lane}`)}
    {@const Icon = ROOMS[n.type].icon}
    {@const size = n.type === 'boss' ? 'size-14' : 'size-10'}
    <div class="absolute flex -translate-1/2 items-center gap-2" style:left="{pad(n.x)}%" style:top="{pad(n.y)}%">
      <span
        class="flex {size} items-center justify-center rounded-full border-2 {tone(n)}"
        title="{ROOMS[n.type].label}, floor {n.floor}"
        data-room={n.type}
        data-state={n.state}><Icon class="size-5" /></span
      >
      {#if n.state === 'here'}
        <span class="absolute right-full mr-1 flex items-end">
          {#each game.heroes.filter(h => h.hp > 0) as h (h.seat)}
            {#if h.classId && isClassId(h.classId)}<PixelSprite id={h.classId} scale={1.5} />{/if}
          {/each}
        </span>
        <span class="absolute left-full ml-1 whitespace-nowrap font-display text-sm font-bold uppercase text-dg-gold">You are here</span>
      {:else if n.state === 'next' || n.type === 'boss'}
        <span
          class="absolute left-full ml-1 whitespace-nowrap font-display text-sm font-bold uppercase {n.type === 'boss'
            ? 'text-dg-hp'
            : 'text-dg-gold'}">{ROOMS[n.type].label}</span
        >
      {/if}
    </div>
  {/each}
</div>
