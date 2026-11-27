<script lang="ts">
  // Party select (Dungeon-Pixel-Party): every hero picks a class nobody else has and the host starts the
  // run. Difficulty and length are the lobby's (shown here, set there), so history reads what was played. A viewer picks for their own seats, the host for any.
  import { Check, Play } from '@lucide/svelte'
  import type { DungeonGame, UserAction } from '$lib/api/game-ws'
  import { CLASS_COLOR } from '$lib/dungeon/view'
  import { ARTIFACTS } from '$shared/dungeon/content/artifacts'
  import { CLASSES, CLASS_IDS, isClassId, modifiersOf, type ClassId } from '$shared/dungeon/content/classes'
  import { DIFFICULTIES, DIFFICULTY_LABEL, DUNGEON_RULES, FLOOR_COUNTS } from '$shared/dungeon/rules'
  import ArtifactIcon from './ArtifactIcon.svelte'
  import PixelSprite from './PixelSprite.svelte'

  let {
    game,
    names,
    mySeats,
    host,
    viewOnly,
    send,
  }: { game: DungeonGame; names: string[]; mySeats: number[]; host: boolean; viewOnly: boolean; send: (a: UserAction) => void } = $props()

  const mine = (seat: number) => !viewOnly && (host || mySeats.includes(seat))
  let picking = $state<number | null>(null)
  // Whose class a tap sets: the chosen seat, else the first of mine still picking, else my first
  const seat = $derived(
    picking ?? game.heroes.find(h => h.classId === null && mine(h.seat))?.seat ?? game.heroes.find(h => mine(h.seat))?.seat ?? null,
  )
  let healerFor = $state<number | null>(null)
  const takenBy = (id: ClassId) => game.heroes.find(h => h.classId === id)?.seat ?? null
  const ready = $derived(game.heroes.every(h => h.classId !== null))
  const waiting = $derived(game.heroes.filter(h => h.classId === null).map(h => names[h.seat]))

  function pick(id: ClassId) {
    if (seat === null) return
    if (id === 'healer') {
      healerFor = seat
      return
    }
    send({ type: 'dungeon_pick_class', seat, classId: id })
    picking = null
  }
  function heal(n: number) {
    if (healerFor === null) return
    send({ type: 'dungeon_pick_class', seat: healerFor, classId: 'healer', healSegment: n })
    healerFor = null
    picking = null
  }
</script>

<main class="flex h-full flex-col gap-4 overflow-y-auto bg-dg-bg p-4 text-dg-text md:p-5 lg:flex-row" data-testid="dungeon-party">
  <section class="flex min-w-0 flex-1 flex-col gap-3">
    <header>
      <h2 class="font-display text-2xl font-bold uppercase text-dg-gold md:text-3xl">Choose your hero</h2>
      <p class="text-sm text-dg-muted">
        Each player picks a class. A class can only be taken once.{seat !== null && game.heroes.length > 1
          ? ` Picking for ${names[seat]}.`
          : ''}
      </p>
    </header>
    <ul class="grid grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-5">
      {#each CLASS_IDS as id (id)}
        {@const entry = CLASSES[id]}
        {@const owner = takenBy(id)}
        {@const hp = Math.round(DUNGEON_RULES.startHp * (modifiersOf(id).maxHp ?? 1))}
        <li
          class="flex gap-3 rounded-xl border-2 bg-dg-panel p-3 xl:flex-col {owner !== null ? 'border-dg-gold' : 'border-dg-line'}"
          data-class={id}
        >
          <div class="flex shrink-0 items-end justify-center rounded-lg bg-dg-bg p-2 xl:h-44">
            <PixelSprite {id} scale={8} shadow label={entry.name} class="max-xl:hidden" />
            <PixelSprite {id} scale={3} shadow label={entry.name} class="xl:hidden" />
          </div>
          <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <div class="flex items-baseline justify-between gap-2">
              <h3 class="font-display text-xl font-bold uppercase">{entry.name}</h3>
              <span class="text-sm text-dg-muted">{hp} HP</span>
            </div>
            <p class="text-sm"><span class="font-display font-bold uppercase text-dg-gold">Passive</span> {entry.description}</p>
            <div class="flex items-center gap-1 text-sm text-dg-muted">
              <ArtifactIcon id={entry.startingArtifact} scale={2} />
              Starts with {ARTIFACTS[entry.startingArtifact].name}
            </div>
            {#if healerFor !== null && id === 'healer'}
              <div class="flex flex-col gap-1" role="group" aria-label="Healing number">
                <span class="text-xs text-dg-muted">Pick the number that heals the party</span>
                <div class="grid grid-cols-10 gap-1">
                  {#each Array.from({ length: 20 }, (_, i) => i + 1) as n (n)}
                    <button
                      type="button"
                      class="rounded-sm border border-dg-line bg-dg-raised py-1 text-xs hover:border-dg-gold"
                      onclick={() => heal(n)}>{n}</button
                    >
                  {/each}
                </div>
              </div>
            {/if}
            <div class="mt-auto pt-1">
              {#if owner !== null}
                <span
                  class="inline-flex items-center gap-1 rounded-full bg-dg-gold px-3 py-1 font-display text-sm font-bold uppercase text-dg-bg"
                >
                  <Check class="size-3.5" />{names[owner]}
                </span>
              {:else if seat !== null}
                <button
                  type="button"
                  class="rounded-full border border-dg-line px-3 py-1 font-display text-sm font-bold uppercase hover:border-dg-gold"
                  onclick={() => pick(id)}>Pick for {names[seat]}</button
                >
              {/if}
            </div>
          </div>
        </li>
      {/each}
    </ul>
  </section>

  <aside class="flex shrink-0 flex-col gap-4 lg:w-80">
    <section class="rounded-xl border border-dg-line bg-dg-panel p-3">
      <h3 class="mb-2 font-display text-lg font-bold uppercase text-dg-muted">Party · {game.heroes.length}</h3>
      <ul class="grid grid-cols-2 gap-2 p-0 lg:grid-cols-1">
        {#each game.heroes as h (h.seat)}
          <li>
            <button
              type="button"
              disabled={!mine(h.seat)}
              aria-pressed={seat === h.seat}
              class="flex w-full items-center gap-3 rounded-lg border bg-dg-raised p-2 text-left {seat === h.seat
                ? 'border-dg-gold'
                : 'border-dg-line'}"
              onclick={() => (picking = h.seat)}
            >
              <span class="flex size-12 items-center justify-center rounded-md bg-dg-bg">
                {#if h.classId && isClassId(h.classId)}<PixelSprite id={h.classId} scale={2} />{/if}
              </span>
              <span class="flex min-w-0 flex-col">
                <span class="truncate font-display font-bold uppercase">{names[h.seat]}</span>
                <span class="text-sm {h.classId ? 'text-dg-gold' : 'text-dg-muted'}">{h.classId ? 'Ready' : 'Picking a hero…'}</span>
              </span>
              {#if h.classId && isClassId(h.classId)}<span class="ml-auto size-2.5 rounded-full" style:background={CLASS_COLOR[h.classId]}
                ></span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    </section>

    <section class="flex flex-col gap-2 rounded-xl border border-dg-line bg-dg-panel p-3">
      <h3 class="font-display text-lg font-bold uppercase text-dg-muted">Run</h3>
      <span class="text-sm text-dg-muted">Difficulty</span>
      <ul class="grid grid-cols-4 gap-1.5" aria-label="Difficulty">
        {#each DIFFICULTIES as d (d)}
          <li
            aria-current={game.difficulty === d}
            class="rounded-lg border py-2 text-center text-sm {game.difficulty === d
              ? 'border-dg-gold bg-dg-raised text-dg-gold'
              : 'border-dg-line text-dg-dim'}"
          >
            {DIFFICULTY_LABEL[d]}
          </li>
        {/each}
      </ul>
      <span class="text-sm text-dg-muted">Length</span>
      <ul class="grid grid-cols-3 gap-1.5" aria-label="Length">
        {#each FLOOR_COUNTS as n (n)}
          <li
            aria-current={game.floors === n}
            class="rounded-lg border py-2 text-center text-sm {game.floors === n
              ? 'border-dg-gold bg-dg-raised text-dg-gold'
              : 'border-dg-line text-dg-dim'}"
          >
            {n} floors
          </li>
        {/each}
      </ul>
      <span class="text-xs text-dg-muted">Set in the lobby's game settings.</span>
    </section>

    <div class="mt-auto flex flex-col gap-2">
      <p class="text-center text-sm text-dg-muted">
        {waiting.length > 0
          ? `Waiting for ${waiting.join(', ')} to pick a hero.`
          : host
            ? 'Everyone is ready.'
            : 'Waiting for the host to start.'}
      </p>
      {#if host && !viewOnly}
        <button
          type="button"
          disabled={!ready}
          class="flex items-center justify-center gap-2 rounded-xl bg-dg-gold py-3 font-display text-xl font-bold uppercase text-dg-bg disabled:opacity-40"
          onclick={() => send({ type: 'dungeon_start' })}><Play class="size-5" />Start run</button
        >
      {/if}
    </div>
  </aside>
</main>
