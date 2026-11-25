<script lang="ts">
  // X01 match details section (X01-Details*, X01-Details-Heatmap*): title-tabs "Statistics" (the
  // default: the match's numbers as comparison bars), "Breakdown" and "Heatmap", and, when the coach
  // can review this game, a special "Review" tab at the end of the row. One leg selector ("Match |
  // Leg 1 | Leg 2 | …") is shared by Statistics, Breakdown and Heatmap and filters them to a leg, or to
  // the whole match (Statistics then shows the combined match numbers); Review shows every leg, so
  // it hides the selector. The selector lives here (not in X01Legs or HeatmapView) for the same
  // reason as the highlight and heatmap-player picks: those views are remounted on every tab
  // switch, so a pick they held themselves would reset. The highlight picker (party games) and
  // Heatmap's "Where every dart landed" note sit alongside the title-tabs, as the artboards show.
  import type { GameDetail } from '$lib/api'
  import * as Tabs from '$lib/components/ui/tabs/index.js'
  import X01Legs from './X01Legs.svelte'
  import HeatmapView from './HeatmapView.svelte'
  import X01LegStats from './X01LegStats.svelte'
  import HighlightPicker from './HighlightPicker.svelte'
  import { sideRules, x01Sides } from '$lib/details/x01'
  import { rulesText } from '$shared/handicap'
  import { highlightDefault } from '$lib/details/page'
  import { flag } from '$lib/flags'
  import { canReview } from '$lib/details/review'
  import X01Review from './X01Review.svelte'

  let { detail, party = false }: { detail: GameDetail; party?: boolean } = $props()
  const coachEnabled = flag('coach.enabled')
  const canCoach = $derived(canReview(detail, $coachEnabled))

  const x01 = $derived(detail.detail.mode === 'x01' ? detail.detail : null)
  const sides = $derived(x01 ? x01Sides(detail.game, x01) : [])
  const legs = $derived(x01?.legs.map(l => l.leg) ?? [])
  // A handicapped game: who played by which rules
  const handicaps = $derived(Array.isArray(detail.game.config.handicaps) ? sideRules(detail.game.config, sides) : null)
  // null = "Match" (every leg), the default.
  let legSel = $state<number | null>(null)
  let highlightPick = $state<number | null>(null)
  const highlight = $derived(
    highlightPick ?? (party ? highlightDefault(detail) : (sides.find(s => s.seats.includes(detail.game.mySeat ?? -1))?.key ?? null)),
  )
  let heatPick = $state<number | null>(null)

  type View = 'stats' | 'breakdown' | 'heatmap' | 'review'
  const tabs: { key: View; label: string }[] = [
    { key: 'stats', label: 'Statistics' },
    { key: 'breakdown', label: 'Breakdown' },
    { key: 'heatmap', label: 'Heatmap' },
  ]
  let view = $state<View>('stats')
  const pickView = (v: string) => (view = v === 'review' ? 'review' : (tabs.find(t => t.key === v)?.key ?? view))
</script>

<section aria-label="Statistics, breakdown, heatmap or review" class="flex flex-col gap-4 min-w-0">
  <!-- contents: the tabs, the leg selector and the panel stay the section's own flex children -->
  <Tabs.Root value={view} onValueChange={pickView} class="contents">
    <div class="flex flex-col gap-3">
      <!-- Heading navigation (the H key) otherwise has nothing to land on: the title-tabs below are
         buttons, not text, so this gives the section a heading without changing how it looks. -->
      <h2 class="sr-only">Match view</h2>
      {#if handicaps}
        <ul aria-label="Handicaps" class="flex flex-wrap gap-x-4 gap-y-1 text-small text-text-muted">
          {#each sides as side, i (side.key)}
            <li><span class="font-semibold text-text">{side.name}</span> {rulesText(handicaps[i])}</li>
          {/each}
        </ul>
      {/if}
      <Tabs.List aria-label="Match view" class="flex flex-wrap items-end gap-x-[22px] gap-y-2">
        {#each tabs as t (t.key)}
          <Tabs.Trigger variant="title" value={t.key}>{t.label}</Tabs.Trigger>
        {/each}
        {#if canCoach}
          <Tabs.Trigger variant="title" value="review">Review</Tabs.Trigger>
        {/if}
      </Tabs.List>

      <!-- Under the tabs, right-aligned: the picks that narrow the view -->
      <div class="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-x-3 gap-y-2">
        {#if view === 'heatmap'}
          <span class="text-small text-text-dim whitespace-nowrap">Where every dart landed</span>
        {:else if party && view === 'breakdown'}
          <HighlightPicker
            options={sides.map(s => ({ key: s.key, name: s.name }))}
            value={highlight ?? 0}
            onpick={(k: number) => (highlightPick = k)}
          />
        {/if}

        {#if x01 && view !== 'review'}
          <div role="group" aria-label="Leg" class="flex flex-wrap justify-end gap-0.5 p-0.5 bg-bg rounded-md">
            <button
              type="button"
              aria-pressed={legSel === null}
              onclick={() => (legSel = null)}
              class="h-8 min-w-14 px-2.5 border-0 rounded-segment text-label cursor-pointer
 {legSel === null ? 'bg-accent text-accent-fg font-bold' : 'bg-transparent text-ink-2'}">Match</button
            >
            {#each legs as l (l)}
              <button
                type="button"
                aria-pressed={l === legSel}
                onclick={() => (legSel = l)}
                class="h-8 min-w-14 px-2.5 border-0 rounded-segment text-label cursor-pointer
 {l === legSel ? 'bg-accent text-accent-fg font-bold' : 'bg-transparent text-ink-2'}">Leg {l + 1}</button
              >
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <Tabs.Content value="stats" class="flex flex-col gap-4 min-w-0">
      {#if view === 'stats'}<X01LegStats {detail} leg={legSel} />{/if}
    </Tabs.Content>
    <Tabs.Content value="breakdown" class="flex flex-col gap-4 min-w-0">
      {#if view === 'breakdown'}
        {#if legSel === null}
          {#each legs as l (l)}
            <div class="flex flex-col gap-4 min-w-0">
              <h3 class="font-display font-bold text-[14px] tracking-wordmark uppercase text-text-dim">Leg {l + 1}</h3>
              <X01Legs {detail} leg={l} {highlight} />
            </div>
          {/each}
        {:else}
          <X01Legs {detail} leg={legSel} {highlight} />
        {/if}
      {/if}
    </Tabs.Content>
    <Tabs.Content value="heatmap" class="flex flex-col gap-4 min-w-0">
      {#if view === 'heatmap'}
        <HeatmapView {detail} picked={heatPick} onpick={(s: number) => (heatPick = s)} leg={legSel} />
      {/if}
    </Tabs.Content>
    <Tabs.Content value="review" class="flex flex-col gap-4 min-w-0">
      {#if view === 'review' && canCoach}<X01Review {detail} />{/if}
    </Tabs.Content>
  </Tabs.Root>
</section>
