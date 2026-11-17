<script lang="ts">
  // Where are you playing? (Tournament-Mode-Board): a free board of the tournament, or no board
  // (the scores typed in on this device), who throws first, Start match. A board in use or offline
  // is listed but can't be picked.
  import { onMount } from 'svelte'
  import { Check, Keyboard, Play, Target } from '@lucide/svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import SegmentedControl from '$lib/components/stats/SegmentedControl.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import type { Tournament } from '$lib/api'
  import { gamePill } from '$lib/tournaments/browse'
  import type { LiveMatch, LiveMessage } from '$lib/tournaments/live'
  import { matchLabel } from '$lib/tournaments/mode'
  import {
    boardLine,
    defaultBoard,
    firstChoices,
    lastBoardId,
    loadPlayBoards,
    matchTitle,
    pickable,
    rememberBoard,
    startMatch,
    type First,
    type PlayBoard,
  } from '$lib/tournaments/play'

  let {
    tournament,
    m,
    match,
    onstarted,
    onclose,
  }: {
    tournament: Tournament
    m: LiveMessage
    match: LiveMatch
    /** The game is on: open it. */
    onstarted: (sessionId: string) => void
    onclose: () => void
  } = $props()

  const nameOf = (i: 0 | 1) => m.entries.find(e => e.id === match.sides[i])?.name ?? 'To be decided'
  const names = $derived<[string, string]>([nameOf(0), nameOf(1)])
  const last = lastBoardId()
  let boards = $state<PlayBoard[] | null>(null)
  let failed = $state(false)
  // A game that can't start with a chosen player doesn't ask
  let choosesFirst = $state(true)
  // null: no board
  let boardId = $state<string | null>(null)
  let first = $state<First>('bull_off')
  let starting = $state(false)
  let error = $state<string | null>(null)

  onMount(() => {
    void loadPlayBoards(tournament.id).then(res => {
      failed = res === null
      boards = res?.boards ?? []
      choosesFirst = res?.choosesFirst ?? true
      boardId = defaultBoard(boards, last)
    })
  })

  const using = (b: PlayBoard) => {
    const other = m.matches.find(x => x.key === b.matchKey)
    return other ? matchTitle(m, tournament.format, other) : null
  }

  async function start() {
    starting = true
    error = null
    const res = await startMatch(tournament.id, match.key, boardId, first)
    starting = false
    if ('error' in res) {
      error = res.error
      return
    }
    rememberBoard(boardId)
    onstarted(res.sessionId)
  }
</script>

<Modal
  title="Where are you playing?"
  subtitle="{matchLabel(m, tournament.format, match)} · {names[0]} vs {names[1]}"
  {onclose}
  widthClass="md:max-w-lg"
>
  <fieldset class="flex flex-col gap-2" aria-label="Where are you playing?" disabled={boards === null || starting}>
    {#each boards ?? [] as b (b.id)}
      {@render option(
        b.id,
        b.name,
        boardLine(b, last, using(b)),
        pickable(b),
        b.state === 'free' ? null : b.state === 'in_use' ? 'IN USE' : 'OFFLINE',
      )}
    {/each}
    {@render option(null, 'No board', 'Type in each visit’s score on this device', true, null)}
  </fieldset>
  {#if boards === null}
    <p class="text-label text-text-muted" role="status">Looking for boards…</p>
  {:else if failed}
    <p class="text-label text-danger" role="alert">The boards could not be loaded. You can still play without a board.</p>
  {/if}

  {#if choosesFirst}
    <div class="flex flex-col gap-2">
      <span class="field-label">Who throws first?</span>
      <SegmentedControl
        label="Who throws first?"
        items={firstChoices(names)}
        value={first}
        fill
        onchange={id => (first = firstChoices(names).find(c => c.id === id)?.id ?? 'bull_off')}
      />
    </div>
  {/if}
  {#if error}<ErrorText>{error}</ErrorText>{/if}

  {#snippet footer()}
    <span class="mr-auto hidden text-small text-text-muted sm:inline"
      >{gamePill(tournament.gameId, tournament.gameConfig)} · first to {match.firstTo}</span
    >
    <Button variant="ghost" onclick={onclose}>Cancel</Button>
    <Button variant="accent" disabled={boards === null || starting} onclick={() => void start()}>
      <Play size={18} aria-hidden="true" />Start match
    </Button>
  {/snippet}
</Modal>

{#snippet option(id: string | null, name: string, line: string, enabled: boolean, pill: string | null)}
  <label
    class="flex min-h-14 items-center gap-3 rounded-lg border px-3.5 py-2.5 {enabled
      ? 'cursor-pointer'
      : 'cursor-not-allowed opacity-60'} {boardId === id && enabled ? 'border-accent bg-accent/10' : 'border-line-2 bg-surface-1'}"
  >
    <input type="radio" class="sr-only" name="board" disabled={!enabled} checked={boardId === id} onchange={() => (boardId = id)} />
    <span
      class="grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] {boardId === id && enabled
        ? 'border-accent bg-accent text-bg'
        : 'border-line-3'}"
      aria-hidden="true"
    >
      {#if boardId === id && enabled}<Check size={12} strokeWidth={3} />{/if}
    </span>
    {#if id === null}<Keyboard size={20} class="shrink-0 text-ink-2" aria-hidden="true" />{:else}<Target
        size={20}
        class="shrink-0 text-ink-2"
        aria-hidden="true"
      />{/if}
    <span class="flex min-w-0 grow flex-col leading-tight">
      <span class="truncate text-body font-semibold">{name}</span>
      <span class="truncate text-small text-text-muted">{line}</span>
    </span>
    {#if pill}
      <span class="inline-flex h-5 items-center rounded-pill bg-surface-chip px-2 type-pill text-caption font-bold text-ink-2">{pill}</span>
    {/if}
  </label>
{/snippet}
