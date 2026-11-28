<script lang="ts">
  // A treasure room (Dungeon-Pixel-Treasure, -Phone): each living hero takes one of the artifacts they
  // were offered. A seat's pick is the host's or that seat's controller's. The seat choosing now shows its
  // three cards; a viewer's later seats wait behind "?" until it is their turn, and a seat that picked
  // shows what it took (only that one: the engine keeps just the pick).
  import { ArrowUp, Check } from '@lucide/svelte'
  import type { DungeonGame, UserAction } from '$lib/api/game-ws'
  import { choosesFor } from '$lib/dungeon/battle'
  import { classOf, RARITY_COLOR } from '$lib/dungeon/view'
  import { ARTIFACTS, isArtifactId, type ArtifactId } from '$shared/dungeon/content/artifacts'
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

  const who = $derived({ mySeats, host, viewOnly })
  const seats = $derived(game.heroes.filter(h => h.hp > 0))
  const offers = $derived(game.offers ?? [])
  const pending = $derived(seats.filter(h => offers[h.seat]))
  // The first seat the viewer picks for that still has to pick; with none (a spectator) the first to pick
  const mine = $derived((pending.find(h => choosesFor(h.seat, who)) ?? pending.at(0))?.seat ?? null)
  const state = (seat: number): 'picked' | 'choosing' | 'waiting' =>
    !offers[seat] ? 'picked' : !choosesFor(seat, who) || seat === mine ? 'choosing' : 'waiting'
  const pickedId = (seat: number): ArtifactId | null => game.heroes[seat].artifacts.findLast(isArtifactId) ?? null
</script>

{#snippet card(id: string, seat: number, index: number | null, picked: boolean)}
  {@const a = isArtifactId(id) ? ARTIFACTS[id] : null}
  {@const colour = a ? RARITY_COLOR[a.rarity] : RARITY_COLOR.common}
  {@const open = index !== null && choosesFor(seat, who) && seat === mine}
  {#snippet body()}
    <span
      class="flex size-[52px] shrink-0 items-center justify-center rounded-xl bg-dg-bg md:size-[72px]"
      style:filter="drop-shadow(0 0 8px {colour}66)"
    >
      {#if isArtifactId(id)}<PixelSprite {id} scale={4} class="max-md:scale-[.7]" />{/if}
    </span>
    <span class="flex min-w-0 flex-col gap-1">
      <span class="flex flex-wrap items-baseline gap-x-2">
        <span class="font-display text-lg font-bold uppercase tracking-wider md:text-xl">{a?.name ?? id}</span>
        <span class="font-display text-xs font-bold uppercase tracking-wider" style:color={colour}>{a?.rarity}</span>
      </span>
      <span class="text-sm text-dg-muted">{a?.description}</span>
      {#if a}
        <span class="mt-0.5 flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wider text-dg-gold max-md:hidden"
          ><ArrowUp class="size-2.5" />{a.trigger}</span
        >
      {/if}
    </span>
    {#if picked}
      <span
        class="absolute right-2.5 top-2.5 flex h-6 items-center gap-1 rounded-full bg-dg-gold px-2 font-display text-xs font-bold uppercase tracking-wider text-dg-bg"
        ><Check class="size-2.5" />Picked</span
      >
    {/if}
  {/snippet}
  {@const frame = [
    'relative flex min-w-0 flex-1 items-start gap-3 rounded-xl p-3 text-left text-dg-text md:h-[150px] md:gap-3.5 md:px-3.5',
    picked ? 'border-2 border-dg-gold bg-[#2c2410]' : 'border bg-dg-raised',
    open && 'cursor-pointer transition hover:-translate-y-1 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-dg-gold',
  ]}
  {@const border = picked ? undefined : open ? colour : 'var(--color-dg-line)'}
  {#if open}
    <button
      type="button"
      onclick={() => send({ type: 'dungeon_choose_reward', seat, index })}
      data-testid="offer"
      aria-label="{a?.name ?? id}, {a?.rarity}. {a?.description}"
      class={frame}
      style:border-color={border}>{@render body()}</button
    >
  {:else}
    <div data-testid="offer" class={frame} style:border-color={border}>{@render body()}</div>
  {/if}
{/snippet}

<main class="flex h-full flex-col gap-3 overflow-y-auto bg-dg-bg p-3 text-dg-text md:p-5" data-testid="dungeon-treasure">
  <header class="md:hidden">
    <h2 class="font-display text-2xl font-bold uppercase tracking-wider text-dg-gold">Treasure</h2>
    <p class="text-sm text-dg-muted">Each hero picks one of three artifacts.</p>
  </header>
  <RoomStage
    class="h-[260px] shrink-0 md:h-[220px]"
    label="Treasure room: an open chest in front of the party"
    heroes={game.heroes}
    prop="chest"
    glow="242,193,78"
  >
    <div class="absolute left-6 top-5 hidden max-w-[420px] flex-col gap-1.5 md:flex">
      <h2 class="font-display text-3xl font-bold uppercase tracking-wider text-dg-gold">Treasure</h2>
      <p class="text-sm text-dg-muted">Every hero picks one of three artifacts, one after another in throwing order.</p>
    </div>
  </RoomStage>
  {#each seats as h (h.seat)}
    {@const s = state(h.seat)}
    {@const classId = classOf(h)}
    {@const picked = pickedId(h.seat)}
    <section
      aria-label="{names[h.seat]}'s treasure"
      class="flex flex-col gap-3 rounded-xl bg-dg-panel p-3 md:grid md:grid-cols-[150px_minmax(0,1fr)] md:items-center md:gap-4 md:px-3.5 {s ===
        'choosing' && offers[h.seat]
        ? 'border-2 border-dg-gold'
        : 'border border-dg-line'}"
    >
      <div class="flex items-center gap-3 md:flex-col md:items-start md:gap-1.5">
        <span
          class="flex h-[60px] w-16 items-center justify-center overflow-hidden rounded-xl border border-dg-line bg-dg-bg max-md:h-9 max-md:w-10"
        >
          {#if classId}<PixelSprite id={classId} scale={3} class="max-md:scale-50" />{/if}
        </span>
        <span class="font-display text-base font-bold uppercase tracking-wider">{names[h.seat]}</span>
        <span class="text-sm max-md:ml-auto {s === 'picked' ? 'text-dg-gold' : s === 'choosing' ? 'text-dg-text' : 'text-dg-muted'}">
          {#if s === 'picked'}{picked ? `Picked ${ARTIFACTS[picked].name}` : 'Picked'}
          {:else if s === 'waiting'}Up next<span class="max-md:hidden">: revealed on their turn</span>
          {:else if choosesFor(h.seat, who)}<span class="md:hidden">Tap a card</span><span class="max-md:hidden">Choosing now: tap one</span
            >
          {:else}Choosing now{/if}
        </span>
      </div>
      {#if s === 'picked'}
        <div class="flex gap-3">
          {#if picked}{@render card(picked, h.seat, null, true)}{/if}<span class="hidden flex-2 md:block"></span>
        </div>
      {:else if s === 'waiting'}
        <div class="hidden gap-3 md:flex">
          {#each [0, 1, 2] as i (i)}
            <div
              aria-label="Hidden artifact"
              class="flex h-[150px] flex-1 items-center justify-center rounded-xl border border-dg-line bg-[repeating-linear-gradient(45deg,#1f1828_0_10px,#1a1522_10px_20px)] font-display text-5xl font-bold text-[#5a4e6c]"
            >
              ?
            </div>
          {/each}
        </div>
      {:else}
        <div class="flex flex-col gap-2 md:flex-row md:gap-3">
          {#each offers[h.seat] ?? [] as id, index (id)}{@render card(id, h.seat, index, false)}{/each}
        </div>
      {/if}
    </section>
  {/each}
</main>
