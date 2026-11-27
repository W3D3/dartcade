<script lang="ts">
  // An event room (Dungeon-Pixel-Event, -Phone): the text, its 2 to 4 decisions and the party's vote.
  // Every living hero votes; once all have, the most votes win (a tie at random) and the outcome shows
  // on the next screen. A seat's vote is the host's or that seat's controller's.
  import type { DungeonGame, UserAction } from '$lib/api/game-ws'
  import { Button } from '$lib/components/ui/button'
  import { choosesFor } from '$lib/dungeon/battle'
  import { EVENTS, isEventId } from '$shared/dungeon/content/events'

  let {
    game,
    names,
    mySeats,
    host,
    viewOnly,
    send,
  }: { game: DungeonGame; names: string[]; mySeats: number[]; host: boolean; viewOnly: boolean; send: (a: UserAction) => void } = $props()
  const event = $derived(game.event && isEventId(game.event.id) ? EVENTS[game.event.id] : null)
  const votes = $derived(game.event?.votes ?? [])
  const voters = $derived(game.heroes.filter(h => h.hp > 0).map(h => h.seat))
  // The seats this viewer still has to vote for: the first one votes with the buttons
  const mine = $derived(voters.filter(seat => votes[seat] === null && choosesFor(seat, { mySeats, host, viewOnly })))
  const voting = $derived(mine.includes(game.currentPlayer) ? game.currentPlayer : mine.at(0))
</script>

{#if event}
  <main class="flex h-full flex-col gap-3 overflow-y-auto bg-bg p-3 text-text md:p-5" data-testid="dungeon-event">
    <h2 class="font-display text-2xl font-bold uppercase text-gold">{event.title}</h2>
    <p class="text-lg">{event.text}</p>
    <p class="text-sm text-text-muted">
      {voters.filter(s => votes[s] !== null).length} of {voters.length} voted{voting !== undefined
        ? ` · ${names[voting]} votes`
        : ' · waiting for the party'}
    </p>
    <ul class="flex flex-col gap-2">
      {#each event.decisions as d, decision (d.label)}
        {@const who = voters.filter(s => votes[s] === decision)}
        <li class="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-panel p-3" data-testid="decision">
          <span class="flex-1 font-display text-lg font-bold">{d.label}</span>
          {#if who.length}<span class="text-sm text-text-muted">{who.map(s => names[s]).join(', ')}</span>{/if}
          {#if voting !== undefined}
            <Button variant="outline" onclick={() => send({ type: 'dungeon_vote', seat: voting, decision })}>Vote</Button>
          {/if}
        </li>
      {/each}
    </ul>
  </main>
{/if}
