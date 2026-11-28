<script lang="ts">
  // An event room (Dungeon-Pixel-Event, -Event-Phone): the picture, the text, its 2 to 4 decisions as cards
  // and who has voted. Every living hero votes by tapping a card; once all have, the most votes win (a tie at
  // random) and the outcome shows on the next screen. A seat's vote is the host's or that seat's controller's.
  // The artboard's board with the two halves is not here: the engine ignores darts in an event and takes
  // the vote as an action, so the cards are the vote and are labelled Option n, never a half of the board.
  import type { DungeonGame, UserAction } from '$lib/api/game-ws'
  import { choosesFor, outcomeText } from '$lib/dungeon/battle'
  import { EVENTS, isEventId } from '$shared/dungeon/content/events'
  import { classOf } from '$lib/dungeon/view'
  import PixelSprite from './PixelSprite.svelte'
  import RoomStage from './RoomStage.svelte'

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
  // The seats this viewer still has to vote for: the first one votes with the cards
  const mine = $derived(voters.filter(seat => votes[seat] === null && choosesFor(seat, { mySeats, host, viewOnly })))
  const voting = $derived(mine.includes(game.currentPlayer) ? game.currentPlayer : mine.at(0))
  const voted = $derived(voters.filter(s => votes[s] !== null).length)
  const most = $derived(Math.max(0, ...(event?.decisions ?? []).map((_, d) => voters.filter(s => votes[s] === d).length)))
</script>

{#if event}
  <main
    class="flex h-full flex-col gap-3 overflow-y-auto bg-dg-bg p-3 text-dg-text md:p-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] lg:gap-5 lg:overflow-hidden"
    data-testid="dungeon-event"
  >
    <div class="flex flex-col gap-3.5 lg:min-h-0 lg:overflow-y-auto">
      <RoomStage
        class="h-[220px] shrink-0 md:h-[320px] lg:h-[420px]"
        label="Event room: a stone well in front of the party"
        heroes={game.heroes}
        prop="well"
        propScale={1.5}
        glow="111,98,133"
      />
      <section
        class="flex shrink-0 flex-col gap-2.5 rounded-xl border border-dg-dim bg-[#0e0a14] px-5 py-4 md:px-[22px] md:py-[18px]"
        aria-label="Event: {event.title}"
      >
        <h2 class="font-display text-xl font-bold uppercase tracking-wider text-dg-gold">Event · {event.title}</h2>
        <p class="text-base md:text-lg">{event.text}</p>
      </section>
      <ul class="flex shrink-0 flex-col gap-3 p-0 md:flex-row">
        {#each event.decisions as d, decision (d.label)}
          {@const who = voters.filter(s => votes[s] === decision)}
          {@const leading = who.length > 0 && who.length === most}
          <li class="flex min-w-0 flex-1" data-testid="decision">
            <button
              type="button"
              disabled={voting === undefined}
              onclick={() => voting !== undefined && send({ type: 'dungeon_vote', seat: voting, decision })}
              class="flex min-h-[150px] w-full min-w-0 flex-col gap-2.5 rounded-xl p-4 text-left enabled:cursor-pointer enabled:hover:-translate-y-0.5 enabled:focus-visible:outline-2 enabled:focus-visible:outline-dg-gold md:min-h-[200px] md:px-[18px] {leading
                ? 'border-2 border-dg-gold bg-[#2c2410]'
                : 'border border-dg-dim bg-dg-raised'} items-start"
            >
              <span
                class="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider {leading
                  ? 'text-dg-gold'
                  : 'text-dg-muted'}"
              >
                Option {decision + 1}
              </span>
              <span class="font-display text-2xl/tight font-bold uppercase tracking-wider">{d.label}</span>
              <span class="text-sm text-dg-muted">{outcomeText(d.outcomes)}</span>
              {#if who.length}
                <span class="mt-auto flex flex-col gap-1.5 items-start">
                  <span class="font-display text-xs font-bold uppercase tracking-wider {leading ? 'text-dg-gold' : 'text-dg-muted'}"
                    >{leading ? 'Leading · ' : ''}{who.length} {who.length === 1 ? 'vote' : 'votes'}</span
                  >
                  <span class="flex gap-1">
                    {#each who as s (s)}
                      {@const c = classOf(game.heroes[s])}
                      <span
                        class="flex h-[34px] w-9 items-center justify-center overflow-hidden rounded-lg border border-dg-line bg-dg-bg"
                        title={names[s]}
                      >
                        {#if c}<PixelSprite id={c} scale={2} />{/if}
                      </span>
                    {/each}
                  </span>
                </span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </div>
    <aside class="flex flex-col gap-3 lg:min-h-0" aria-label="Vote">
      <div class="flex items-baseline justify-between gap-2">
        <h3 class="font-display text-xl font-bold uppercase tracking-wider text-dg-gold">Vote · What do you do?</h3>
        <span class="text-sm text-dg-muted"
          >{voted} of {voters.length} voted{voting !== undefined ? ' · ' : ''}<span class="text-dg-text"
            >{voting !== undefined ? `${names[voting]} votes` : voted < voters.length ? ' · waiting for the party' : ''}</span
          ></span
        >
      </div>
      <ul class="flex flex-col gap-2 rounded-xl border border-dg-line bg-dg-panel p-3">
        {#each voters as seat (seat)}
          {@const c = classOf(game.heroes[seat])}
          <li class="flex items-center gap-3">
            <span class="flex h-[34px] w-10 items-center justify-center overflow-hidden rounded-lg border border-dg-line bg-dg-bg">
              {#if c}<PixelSprite id={c} scale={2} />{/if}
            </span>
            <span class="font-display text-base font-bold uppercase tracking-wider">{names[seat]}</span>
            <span class="ml-auto text-sm {votes[seat] !== null ? 'text-dg-gold' : 'text-dg-muted'}">
              {votes[seat] !== null ? `Voted: ${event.decisions[votes[seat]].label}` : seat === voting ? 'Voting now' : 'Waiting'}
            </span>
          </li>
        {/each}
      </ul>
      <p class="text-sm text-dg-muted">Tap a card to vote. Most votes win; a tie is decided at random.</p>
    </aside>
  </main>
{/if}
