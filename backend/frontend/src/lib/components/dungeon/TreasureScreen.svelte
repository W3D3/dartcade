<script lang="ts">
  // A treasure room (Dungeon-Pixel-Treasure, -Phone): each living hero takes one of the artifacts they
  // were offered. A seat's pick is the host's or that seat's controller's; the others watch it wait.
  // shortcut: text cards, no sprites or rarity outlines until the polish PR
  import type { DungeonGame, UserAction } from '$lib/api/game-ws'
  import { Button } from '$lib/components/ui/button'
  import { choosesFor } from '$lib/dungeon/battle'
  import { ARTIFACTS, isArtifactId } from '$shared/dungeon/content/artifacts'

  let {
    game,
    names,
    mySeats,
    host,
    viewOnly,
    send,
  }: { game: DungeonGame; names: string[]; mySeats: number[]; host: boolean; viewOnly: boolean; send: (a: UserAction) => void } = $props()
  const offers = $derived(game.offers ?? [])
</script>

<main class="flex h-full flex-col gap-3 overflow-y-auto bg-dg-bg p-3 text-dg-text md:p-5" data-testid="dungeon-treasure">
  <h2 class="font-display text-2xl font-bold uppercase text-dg-gold">Treasure · floor {game.floor}</h2>
  <p class="text-dg-muted">Every hero takes one artifact.</p>
  {#each offers as offer, seat (seat)}
    {#if offer}
      {@const mine = choosesFor(seat, { mySeats, host, viewOnly })}
      <section class="flex flex-col gap-2 rounded-xl border border-dg-line bg-dg-panel p-3" aria-label="{names[seat]}'s pick">
        <h3 class="font-display text-lg font-bold uppercase">{names[seat]}{mine ? ' picks' : ' is choosing…'}</h3>
        <div class="grid gap-2 md:grid-cols-3">
          {#each offer as id, index (id)}
            {@const a = isArtifactId(id) ? ARTIFACTS[id] : null}
            <div class="flex flex-col gap-1 rounded-lg border border-dg-line p-2" data-testid="offer">
              <span class="font-display font-bold uppercase">{a?.name ?? id}</span>
              <span class="text-xs uppercase text-dg-muted">{a?.rarity} · {a?.trigger}</span>
              <span class="text-sm">{a?.description}</span>
              {#if mine}
                <Button class="mt-auto" variant="outline" onclick={() => send({ type: 'dungeon_choose_reward', seat, index })}>Take</Button>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/each}
</main>
