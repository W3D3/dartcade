<script lang="ts">
  // shortcut: the fight, treasure, rest and event as plain text (choices as buttons, the board below)
  // until their Dungeon-Pixel screens replace it
  import BoardOrKeypad from '$lib/components/match/BoardOrKeypad.svelte'
  import { Button } from '$lib/components/ui/button'
  import { gameState } from '$lib/gameState'
  import { ARTIFACTS, isArtifactId } from '$shared/dungeon/content/artifacts'
  import { EVENTS, isEventId } from '$shared/dungeon/content/events'
  import type { MatchProps } from '$lib/components/match/types'

  let {
    snapshot,
    send,
    host,
    viewOnly,
    canThrow,
    locked,
    canUndo,
    next,
    onUndo,
    onNext,
    onBoardClick,
    onCorrect,
    onDartMove,
    onDart,
    keypad,
  }: MatchProps = $props()
  const game = $derived(gameState(snapshot).dungeon)
  const seat = $derived(game?.currentPlayer ?? 0)
  const name = $derived(snapshot.players[seat]?.name ?? '')
  const artifactName = (id: string) => (isArtifactId(id) ? ARTIFACTS[id].name : id)
</script>

{#if game}
  <main class="flex h-full flex-col items-center gap-3 overflow-auto p-4">
    <p class="max-w-xl rounded-lg border border-dashed border-dg-gold px-4 py-2 text-center text-sm text-dg-gold" role="note">
      Temporary screen: the battle, treasure, rest and event screens are not built yet. Fight and rest with darts (on the board, or Enter
      for the keypad, then Next player); pick treasure and vote on events with the buttons.
    </p>
    {#if host && !viewOnly}
      <!-- DEV until every room has its screen: walks a run to its end without playing each room -->
      <button
        type="button"
        class="rounded-lg border-2 border-dashed border-dg-hp px-4 py-2 font-display font-bold uppercase text-dg-hp"
        onclick={() => send({ type: 'dungeon_dev_resolve' })}>DEV: resolve this room</button
      >
    {/if}
    <p class="font-display text-lg uppercase text-text-muted">
      Dungeon · {game.phase} · floor {game.floor} of {game.floors} · {game.gold} gold
    </p>
    <ul class="flex flex-wrap justify-center gap-3 text-sm">
      {#each game.heroes as h (h.seat)}
        <li class:font-semibold={h.seat === seat}>
          {snapshot.players[h.seat]?.name} · {h.classId ?? '…'} · {h.hp}/{h.maxHp} HP{h.block ? ` · ${h.block} block` : ''} · {h.artifacts
            .map(artifactName)
            .join(', ')}
        </li>
      {/each}
    </ul>
    {#if game.battle}
      <ul class="flex flex-wrap justify-center gap-3 text-sm">
        {#each game.battle.enemies as e (e.uid)}
          <li class:font-semibold={e.uid === game.battle.target}>
            {e.kind} · {e.hp}/{e.maxHp} HP · {e.intent.kind === 'attack' ? `attacks ${e.intent.value}` : 'waits'}
          </li>
        {/each}
      </ul>
    {/if}
    {#if game.trace}
      <p class="text-sm">Last visit: {game.trace.darts.map(d => d.damage).join(' + ')} = {game.trace.total} damage</p>
    {/if}
    {#if !viewOnly && game.phase === 'treasure'}
      <p>{name}: take one</p>
      <div class="flex flex-wrap justify-center gap-2">
        {#each game.offers?.[seat] ?? [] as id, index (id)}
          <Button variant="outline" onclick={() => send({ type: 'dungeon_choose_reward', seat, index })}>{artifactName(id)}</Button>
        {/each}
      </div>
    {:else if !viewOnly && game.phase === 'event' && game.event && isEventId(game.event.id)}
      {@const event = EVENTS[game.event.id]}
      <p>{event.text} {name} votes:</p>
      <div class="flex flex-wrap justify-center gap-2">
        {#each event.decisions as d, decision (d.label)}
          <Button variant="outline" onclick={() => send({ type: 'dungeon_vote', seat, decision })}>{d.label}</Button>
        {/each}
      </div>
    {:else}
      <BoardOrKeypad
        {keypad}
        darts={game.currentVisitDarts}
        {canThrow}
        {locked}
        {canUndo}
        {next}
        {onUndo}
        {onNext}
        {onBoardClick}
        onDart={canThrow ? onDart : () => {}}
        {onCorrect}
        {onDartMove}
      />
    {/if}
  </main>
{/if}
