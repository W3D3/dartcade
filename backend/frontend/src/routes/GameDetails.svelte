<script lang="ts">
  // A finished game's details (X01-Details*, ATC-Details* boards): the result, the match stats
  // for any mode, and the mode's own section. Finished games don't change: loaded once.
  import { onMount } from 'svelte'
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
  import { api, type GameDetail } from '$lib/api'
  import { detailSides, highlightDefault, isGameDetail, layoutOf, loadPhase } from '$lib/details/page'

  let { params }: { params: { id: string } } = $props()
  let detail = $state<GameDetail | null>(null)
  let phase = $state<'loading' | 'ready' | 'missing' | 'failed'>('loading')
  let atcHighlight = $state<number | null>(null)

  async function load() {
    phase = 'loading'
    try {
      const res = await api.GET('/api/games/{id}', { params: { path: { id: params.id } } })
      if (res.data && isGameDetail(res.data)) {
        detail = res.data
        phase = 'ready'
      } else phase = loadPhase(res.response.status)
    } catch {
      phase = 'failed'
    }
  }
  onMount(() => void load())
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
        <a href="#/history" class="font-semibold no-underline">Back to History</a>
      </div>
    {:else if phase === 'failed' || !detail}
      {@render errorCard(() => void load())}
    {:else}
      {@const d = detail}
      <svelte:boundary onerror={(error: unknown) => console.error('details page render failed', error)}>
        {@const layout = layoutOf(d)}
        {@const sides = detailSides(d)}
        <DetailsHeader detail={d} />
        <main
          class="flex-grow min-h-0 overflow-y-auto scrollbar-themed box-border p-4 md:p-6 xl:px-7 flex flex-col lg:flex-row gap-4 md:gap-6"
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
        {#snippet failed(_error: unknown, reset: () => void)}
          {@render errorCard(() => void load().then(reset))}
        {/snippet}
      </svelte:boundary>
    {/if}
  </div>
</Layout>
