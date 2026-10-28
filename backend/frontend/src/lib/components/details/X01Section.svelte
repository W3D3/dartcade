<script lang="ts">
  // X01 match details section (X01-Details*, X01-Details-Heatmap*): three title-tabs, "Breakdown",
  // "Heatmap" and "Leg stats" (the match stats per leg), sharing one card and header row. Breakdown is the default; the view isn't in
  // the URL. Below the title-tabs, one leg selector ("Match | Leg 1 | Leg 2 | …") is shared by
  // every view and filters it to a leg, or to the whole match; it lives here (not in X01Legs
  // or HeatmapView) for the same reason as the highlight and heatmap-player picks: those views
  // are both remounted on every tab switch, so a pick they held themselves would reset. The
  // highlight picker (party games) and Heatmap's "Where every dart landed" note sit alongside
  // the title-tabs, as the artboards show.
  import type { GameDetail } from '$lib/api'
  import * as Tabs from '$lib/components/ui/tabs/index.js'
  import X01Legs from './X01Legs.svelte'
  import HeatmapView from './HeatmapView.svelte'
  import X01LegStats from './X01LegStats.svelte'
  import HighlightPicker from './HighlightPicker.svelte'
  import { x01Sides } from '$lib/details/x01'
  import { highlightDefault } from '$lib/details/page'

  let { detail, party = false }: { detail: GameDetail; party?: boolean } = $props()

  const x01 = $derived(detail.detail.mode === 'x01' ? detail.detail : null)
  const sides = $derived(x01 ? x01Sides(detail.game, x01) : [])
  const legs = $derived(x01?.legs.map(l => l.leg) ?? [])
  // null = "Match" (every leg), the default.
  let legSel = $state<number | null>(null)
  let highlightPick = $state<number | null>(null)
  const highlight = $derived(
    highlightPick ?? (party ? highlightDefault(detail) : (sides.find(s => s.seats.includes(detail.game.mySeat ?? -1))?.key ?? null)),
  )
  let heatPick = $state<number | null>(null)

  type View = 'breakdown' | 'heatmap' | 'legs'
  let view = $state<View>('breakdown')
  const tabs: { key: View; label: string }[] = [
    { key: 'breakdown', label: 'Breakdown' },
    { key: 'heatmap', label: 'Heatmap' },
    { key: 'legs', label: 'Leg stats' },
  ]
  const pickView = (v: string) => (view = tabs.find(t => t.key === v)?.key ?? view)
</script>

<section aria-label="Breakdown, heatmap or leg stats" class="flex flex-col gap-4 min-w-0 box-border p-4 md:p-6 card">
  <!-- contents: the tabs, the leg selector and the panel stay the section's own flex children -->
  <Tabs.Root value={view} onValueChange={pickView} class="contents">
    <div class="flex flex-col gap-3">
      <!-- Heading navigation (the H key) otherwise has nothing to land on: the title-tabs below are
         buttons, not text, so this gives the section a heading without changing how it looks. -->
      <h2 class="sr-only">Match view</h2>
      <div class="flex flex-wrap gap-3 {view === 'heatmap' ? 'items-end justify-between' : 'items-center justify-between'}">
        <Tabs.List aria-label="Match view" class="flex items-end gap-[22px]">
          {#each tabs as t (t.key)}
            <Tabs.Trigger variant="title" value={t.key}>{t.label}</Tabs.Trigger>
          {/each}
        </Tabs.List>

        <div class="flex flex-wrap items-center gap-3">
          {#if view === 'heatmap'}
            <span class="text-[13px] text-text-dim whitespace-nowrap">Where every dart landed</span>
          {:else if party && view === 'breakdown'}
            <HighlightPicker
              options={sides.map(s => ({ key: s.key, name: s.name }))}
              value={highlight ?? 0}
              onpick={(k: number) => (highlightPick = k)}
            />
          {/if}

          {#if x01}
            <div role="group" aria-label="Leg" class="flex flex-wrap gap-1 p-1 bg-bg rounded-[10px]">
              <button
                type="button"
                aria-pressed={legSel === null}
                onclick={() => (legSel = null)}
                class="h-10 min-w-[72px] md:min-w-24 px-3 border-0 rounded-[7px] font-[inherit] text-[15px] cursor-pointer
                 {legSel === null ? 'bg-accent text-accent-fg font-bold' : 'bg-transparent text-ink-2'}">Match</button
              >
              {#each legs as l (l)}
                <button
                  type="button"
                  aria-pressed={l === legSel}
                  onclick={() => (legSel = l)}
                  class="h-10 min-w-[72px] md:min-w-24 px-3 border-0 rounded-[7px] font-[inherit] text-[15px] cursor-pointer
                   {l === legSel ? 'bg-accent text-accent-fg font-bold' : 'bg-transparent text-ink-2'}">Leg {l + 1}</button
                >
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <Tabs.Content value="breakdown" class="flex flex-col gap-4 min-w-0">
      {#if view === 'breakdown'}
        {#if legSel === null}
          {#each legs as l (l)}
            <div class="flex flex-col gap-4 min-w-0">
              <h3 class="m-0 font-display font-bold text-[14px] tracking-[0.06em] uppercase text-text-dim">Leg {l + 1}</h3>
              <X01Legs {detail} {party} leg={l} {highlight} />
            </div>
          {/each}
        {:else}
          <X01Legs {detail} {party} leg={legSel} {highlight} />
        {/if}
      {/if}
    </Tabs.Content>
    <Tabs.Content value="heatmap" class="flex flex-col gap-4 min-w-0">
      {#if view === 'heatmap'}
        <HeatmapView {detail} picked={heatPick} onpick={(s: number) => (heatPick = s)} leg={legSel} />
      {/if}
    </Tabs.Content>
    <Tabs.Content value="legs" class="flex flex-col gap-4 min-w-0">
      {#if view === 'legs'}
        {#each legSel === null ? legs : [legSel] as l (l)}
          <div class="flex flex-col gap-4 min-w-0">
            {#if legSel === null}<h3 class="m-0 font-display font-bold text-[14px] tracking-[0.06em] uppercase text-text-dim">
                Leg {l + 1}
              </h3>{/if}
            <X01LegStats {detail} leg={l} />
          </div>
        {/each}
      {/if}
    </Tabs.Content>
  </Tabs.Root>
</section>
