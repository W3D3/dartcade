<script lang="ts">
  // shortcut: a plain text screen (choices as buttons, the board below) until the Dungeon screens
  // from the Dungeon-Pixel artboards replace it
  import BoardOrKeypad from '$lib/components/match/BoardOrKeypad.svelte'
  import { Button } from '$lib/components/ui/button'
  import { gameState } from '$lib/gameState'
  import { ARTIFACTS, isArtifactId } from '$shared/dungeon/content/artifacts'
  import { CLASSES, CLASS_IDS } from '$shared/dungeon/content/classes'
  import { EVENTS, isEventId } from '$shared/dungeon/content/events'
  import type { MatchProps } from '../types'

  let {
    snapshot,
    send,
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
  const taken = $derived(new Set(game?.heroes.filter(h => h.seat !== seat).map(h => h.classId)))
  const artifactName = (id: string) => (isArtifactId(id) ? ARTIFACTS[id].name : id)
</script>

{#if game}
  <main class="flex h-full flex-col items-center gap-3 overflow-auto p-4">
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
    {#if !viewOnly && game.phase === 'setup'}
      <p>{name}: pick a class</p>
      <div class="flex flex-wrap justify-center gap-2">
        {#each CLASS_IDS as classId (classId)}
          <Button
            variant="outline"
            disabled={taken.has(classId)}
            onclick={() => send({ type: 'dungeon_pick_class', seat, classId, ...(classId === 'healer' ? { healSegment: 20 } : {}) })}
            >{CLASSES[classId].name}</Button
          >
        {/each}
      </div>
    {:else if !viewOnly && game.phase === 'treasure'}
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
    {:else if game.phase === 'ended'}
      <p class="font-display text-2xl uppercase">{game.outcome}</p>
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
