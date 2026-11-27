<script lang="ts">
  // Every hero's artifacts, each with its popup (Dungeon-Pixel-Map). `compact`: one row (the phone's ITEMS).
  import type { DungeonGame } from '$lib/api/game-ws'
  import { isArtifactId } from '$shared/dungeon/content/artifacts'
  import ArtifactIcon from './ArtifactIcon.svelte'

  let { game, names, compact = false }: { game: DungeonGame; names: string[]; compact?: boolean } = $props()
  const owned = $derived(game.heroes.flatMap(h => h.artifacts.filter(isArtifactId).map(id => ({ id, seat: h.seat }))))
</script>

{#if compact}
  <div class="flex items-center gap-1 overflow-x-auto" aria-label="Artifacts">
    <span class="mr-1 font-display text-sm font-bold uppercase text-dg-muted">Items</span>
    {#each owned as a (`${a.seat}-${a.id}`)}<ArtifactIcon id={a.id} owner={names[a.seat]} scale={2} />{/each}
  </div>
{:else}
  <section class="flex flex-col gap-2 rounded-xl border border-dg-line bg-dg-panel p-3" aria-label="Artifacts">
    <div class="flex items-baseline justify-between">
      <h3 class="font-display text-lg font-bold uppercase text-dg-muted">Artifacts · {owned.length}</h3>
      <span class="text-xs text-dg-muted">Hover for details</span>
    </div>
    {#each game.heroes as h (h.seat)}
      <div class="flex flex-col gap-0.5">
        <span class="text-sm">{names[h.seat]}</span>
        <div class="flex flex-wrap gap-1">
          {#each h.artifacts.filter(isArtifactId) as id (id)}<ArtifactIcon {id} owner={names[h.seat]} />{/each}
        </div>
      </div>
    {/each}
  </section>
{/if}
