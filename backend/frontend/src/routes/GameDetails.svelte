<script lang="ts">
  // A finished game's details (X01-Details*, ATC-Details* boards): the result, the match stats
  // for any mode, and the mode's own section. Finished games don't change: loaded once.
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import InvalidateGameModal from '$lib/components/admin/InvalidateGameModal.svelte'
  import { currentUser } from '$lib/auth'
  import { authInfo } from '$lib/authInfo'
  import { invalidatedNote } from '$lib/details/invalidated'
  import {
    DELETE_WARNING,
    deleteGame,
    invalidateGame,
    invalidationText,
    restoreGame,
    RESTORE_WARNING,
    type Invalidation,
  } from '$lib/admin/games'
  import Scorecard from '$lib/components/minigolf/Scorecard.svelte'
  import Layout from '$lib/components/Layout.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import DetailsHeader from '$lib/components/details/DetailsHeader.svelte'
  import ResultCard from '$lib/components/details/ResultCard.svelte'
  import StatsTable from '$lib/components/details/StatsTable.svelte'
  import Standings from '$lib/components/details/Standings.svelte'
  import TeamShares from '$lib/components/details/TeamShares.svelte'
  import X01Section from '$lib/components/details/X01Section.svelte'
  import AtcTargets from '$lib/components/details/AtcTargets.svelte'
  import RaceChart from '$lib/components/details/RaceChart.svelte'
  import HighlightPicker from '$lib/components/details/HighlightPicker.svelte'
  import P121Summary from '$lib/components/p121/P121Summary.svelte'
  import { api, type GameDetail } from '$lib/api'
  import { detailSides, highlightDefault, isGameDetail, layoutOf, loadPhase } from '$lib/details/page'

  // `admin`: opened from the admin game list, so any finished game, with every seat's account
  let { params, admin = false }: { params: { id: string }; admin?: boolean } = $props()
  const back = $derived(admin ? { href: '#/admin/games', label: 'Games' } : { href: '#/history', label: 'History' })
  let detail = $state<GameDetail | null>(null)
  // Admin view only: how a moderator invalidated the game, if one did
  let invalidated = $state<Invalidation>(null)
  let phase = $state<'loading' | 'ready' | 'missing' | 'failed'>('loading')
  let atcHighlight = $state<number | null>(null)

  async function fetchGame(): Promise<{ data: unknown; invalidated: Invalidation; response: Response }> {
    const path = { params: { path: { id: params.id } } }
    if (admin) {
      const res = await api.GET('/api/admin/games/{id}', path)
      return { data: res.data, invalidated: res.data?.invalidated ?? null, response: res.response }
    }
    const res = await api.GET('/api/games/{id}', path)
    return { data: res.data, invalidated: null, response: res.response }
  }

  async function load() {
    phase = 'loading'
    try {
      const res = await fetchGame()
      if (isGameDetail(res.data)) {
        detail = res.data
        invalidated = res.invalidated
        phase = 'ready'
      } else phase = loadPhase(res.response.status)
    } catch {
      phase = 'failed'
    }
  }
  onMount(() => void load())

  // Admin or moderator: invalidate this game; the page then shows it as invalidated
  let confirmingInvalidate = $state(false)
  let invalidateError = $state('')
  async function confirmInvalidate(reason: string): Promise<void> {
    confirmingInvalidate = false
    invalidateError = ''
    const result = await invalidateGame(params.id, reason)
    if ('error' in result) invalidateError = result.error
    else await load()
  }

  // Admins only: delete it for good, then back to the list
  let confirmingDelete = $state(false)
  async function confirmDelete(): Promise<void> {
    confirmingDelete = false
    invalidateError = ''
    const result = await deleteGame(params.id)
    if ('error' in result) invalidateError = result.error
    else void push('/admin/games')
  }

  // ... and take it back
  let confirmingRestore = $state(false)
  async function confirmRestore(): Promise<void> {
    confirmingRestore = false
    invalidateError = ''
    const result = await restoreGame(params.id)
    if ('error' in result) invalidateError = result.error
    else await load()
  }
</script>

<Layout title="Match details">
  <div class="flex flex-col flex-grow min-h-0 min-w-0">
    {#snippet errorCard(retry: () => void)}
      <div class="flex flex-col items-start gap-3 p-8">
        <ErrorText>Couldn't load the game.</ErrorText>
        <Button variant="outline" size="md" onclick={retry}>Try again</Button>
      </div>
    {/snippet}
    {#if phase === 'loading'}
      <p class="m-0 p-8 text-[15px] text-text-muted">Loading the game…</p>
    {:else if phase === 'missing'}
      <div class="flex flex-col items-start gap-3 p-8">
        <p class="m-0 text-[17px] font-semibold">This game isn't available</p>
        <a href={back.href} class="font-semibold no-underline">Back to {back.label}</a>
      </div>
    {:else if phase === 'failed' || !detail}
      {@render errorCard(() => void load())}
    {:else}
      {@const d = detail}
      <svelte:boundary onerror={(error: unknown) => console.error('details page render failed', error)}>
        {@const layout = layoutOf(d)}
        {@const sides = detailSides(d)}
        <DetailsHeader
          detail={d}
          {back}
          oninvalidate={admin && !invalidated ? () => (confirmingInvalidate = true) : undefined}
          ondelete={admin && $currentUser?.isAdmin ? () => (confirmingDelete = true) : undefined}
        />
        {#if invalidated}
          <div
            role="status"
            class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-live-soft px-4 py-3 text-[14px] text-live-text md:px-7"
          >
            <span class="min-w-0 flex-1 basis-[260px]"
              >{invalidationText(invalidated)}. It no longer counts in stats or ratings, and its players see it marked as invalidated.</span
            >
            <Button variant="outline" size="md" onclick={() => (confirmingRestore = true)}>Restore game</Button>
          </div>
        {/if}
        {#if !admin && d.game.invalidated}
          {@const note = invalidatedNote($authInfo.contactEmail)}
          <div role="status" class="border-b border-line bg-live-soft px-4 py-3 text-[14px] text-live-text md:px-7">
            {note.text}
            {#if note.email}
              Questions? Write to <a href="mailto:{note.email}" class="font-semibold">{note.email}</a>.
            {/if}
          </div>
        {/if}
        {#if invalidateError}<div class="px-4 pt-3 md:px-7"><ErrorText>{invalidateError}</ErrorText></div>{/if}
        {#if d.detail.mode === 'p121'}
          <!-- 121's summary has its own standings and stats, so it takes the whole page -->
          {@const players = [...d.game.players].sort((a, b) => a.seat - b.seat)}
          {@const cfg = d.game.config}
          <P121Summary
            detail={d.detail}
            {players}
            seat={highlightDefault(d)}
            yourBest
            missRule={cfg.missRule === 'down' || cfg.missRule === 'stay' ? cfg.missRule : 'reset'}
            startTarget={typeof cfg.startTarget === 'number' ? cfg.startTarget : 121}
            standings={sides
              .map(s => ({
                name: s.name,
                placement: s.placement,
                highestMade: Object.hasOwn(s.values, 'highestMade') ? s.values.highestMade : null,
              }))
              .sort((a, b) => a.placement - b.placement)}
          />
        {:else}
          <main
            class="relative flex-grow min-h-0 overflow-y-auto scrollbar-themed box-border p-4 md:p-6 xl:px-7 flex flex-col lg:flex-row gap-4 md:gap-6"
          >
            <section
              aria-label="Result and statistics"
              class="flex flex-col gap-4 min-w-0 lg:shrink-0 {layout === 'party' ? 'lg:w-[560px]' : 'lg:w-[420px] xl:w-[520px]'}"
            >
              {#if layout === 'party'}
                <Standings rows={d.stats.rows} {sides} />
              {:else}
                <ResultCard detail={d} {sides} />
                <StatsTable rows={d.stats.rows} {sides} title={layout === 'teams' ? 'Team stats' : 'Match stats'} />
                {#if layout === 'teams'}<TeamShares detail={d} />{/if}
              {/if}
            </section>
            <div class="flex-grow min-w-0 flex flex-col gap-4 md:gap-6">
              {#if d.game.mode === 'x01'}<X01Section detail={d} party={layout === 'party'} />{/if}
              {#if d.detail.mode === 'minigolf'}
                <section class="flex flex-col gap-3 rounded-2xl border border-line bg-surface-1 p-5" aria-label="Scorecard">
                  <h2 class="m-0 font-display text-[22px] font-bold uppercase">Scorecard · {d.detail.course}</h2>
                  <Scorecard
                    scores={d.detail.scores}
                    pars={d.detail.holes.map(h => h.par)}
                    players={[...d.game.players].sort((a, b) => a.seat - b.seat)}
                  />
                </section>
              {/if}
              {#if d.game.mode === 'atc'}
                <AtcTargets detail={d} />
                {#if layout === 'party'}
                  <HighlightPicker
                    options={d.game.players.map(p => ({ key: p.seat, name: p.name }))}
                    value={atcHighlight ?? highlightDefault(d)}
                    onpick={(k: number) => (atcHighlight = k)}
                  />
                {/if}
                <RaceChart detail={d} highlight={atcHighlight ?? highlightDefault(d)} />
              {/if}
            </div>
          </main>
        {/if}
        {#snippet failed(_error: unknown, reset: () => void)}
          {@render errorCard(() => void load().then(reset))}
        {/snippet}
      </svelte:boundary>
    {/if}
  </div>
  {#if confirmingDelete}
    <ConfirmModal
      title="Delete this game for good?"
      body={DELETE_WARNING}
      confirmLabel="Delete"
      cancelLabel="Keep it"
      danger
      onconfirm={() => void confirmDelete()}
      oncancel={() => (confirmingDelete = false)}
    />
  {/if}
  {#if confirmingRestore}
    <ConfirmModal
      title="Restore this game?"
      body={RESTORE_WARNING}
      confirmLabel="Restore"
      cancelLabel="Cancel"
      onconfirm={() => void confirmRestore()}
      oncancel={() => (confirmingRestore = false)}
    />
  {/if}
  {#if confirmingInvalidate}
    <InvalidateGameModal onconfirm={(reason: string) => void confirmInvalidate(reason)} oncancel={() => (confirmingInvalidate = false)} />
  {/if}
</Layout>
