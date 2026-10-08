<script lang="ts">
  // X01 match details section (X01-Details*, X01-Details-Heatmap*): two title-tabs, "Leg by
  // leg" and "Heatmap", sharing one card and header row. Leg by leg is the default; the view
  // isn't in the URL. The leg and highlight picks live here (not in X01Legs) so the same header
  // row can hold the title-tabs together with the leg tabs / highlight picker, as the artboards
  // show; Heatmap's "Where every dart landed" note sits in that same spot instead. Heatmap's own
  // player pick lives here too, for the same reason: X01Legs and HeatmapView are both remounted
  // on every tab switch, so any pick they held themselves would reset.
  import type { GameDetail } from '$lib/api'
  import X01Legs from './X01Legs.svelte'
  import HeatmapView from './HeatmapView.svelte'
  import HighlightPicker from './HighlightPicker.svelte'
  import { x01Sides } from '$lib/details/x01'
  import { highlightDefault } from '$lib/details/page'

  let { detail, party = false }: { detail: GameDetail; party?: boolean } = $props()

  const x01 = $derived(detail.detail.mode === 'x01' ? detail.detail : null)
  const sides = $derived(x01 ? x01Sides(detail.game, x01) : [])
  const legs = $derived(x01?.legs.map(l => l.leg) ?? [])
  let legPick = $state<number | null>(null)
  const leg = $derived(legPick ?? legs.at(-1) ?? 0)
  let highlightPick = $state<number | null>(null)
  const highlight = $derived(
    highlightPick ?? (party ? highlightDefault(detail) : (sides.find(s => s.seats.includes(detail.game.mySeat ?? -1))?.key ?? null)),
  )
  let heatPick = $state<number | null>(null)

  type View = 'legs' | 'heatmap'
  let view = $state<View>('legs')
  const tabs: { key: View; label: string }[] = [
    { key: 'legs', label: 'Leg by leg' },
    { key: 'heatmap', label: 'Heatmap' },
  ]

  const id = $props.id()
  function onkey(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    view = e.key === 'Home' ? 'legs' : e.key === 'End' ? 'heatmap' : view === 'legs' ? 'heatmap' : 'legs'
    document.getElementById(`${id}-${view}`)?.focus()
  }
</script>

<section aria-label="Leg by leg or heatmap" class="flex flex-col gap-4 min-w-0 box-border p-4 md:p-6 card">
  <!-- Heading navigation (the H key) otherwise has nothing to land on: the title-tabs below are
       buttons, not text, so this gives the section a heading without changing how it looks. -->
  <h2 class="sr-only">Match view</h2>
  <div class="flex flex-wrap gap-3 {view === 'heatmap' ? 'items-end justify-between' : 'items-center justify-between'}">
    <div role="tablist" aria-label="Match view" tabindex="-1" class="flex items-end gap-[22px]" onkeydown={onkey}>
      {#each tabs as t (t.key)}
        {@const on = view === t.key}
        <button
          type="button"
          role="tab"
          id="{id}-{t.key}"
          aria-selected={on}
          aria-controls="{id}-panel"
          tabindex={on ? 0 : -1}
          onclick={() => (view = t.key)}
          class="p-0 pb-[6px] border-0 bg-transparent font-display font-bold text-[24px] md:text-[32px] leading-none uppercase cursor-pointer font-[inherit] whitespace-nowrap
                 {on ? 'text-text shadow-[inset_0_-3px_0_var(--color-accent)]' : 'text-text-dim hover:text-text'}">{t.label}</button
        >
      {/each}
    </div>

    {#if view === 'heatmap'}
      <span class="text-[13px] text-text-dim whitespace-nowrap">Where every dart landed</span>
    {:else if x01}
      <div class="flex flex-wrap items-center gap-3">
        {#if party}
          <HighlightPicker
            options={sides.map(s => ({ key: s.key, name: s.name }))}
            value={highlight ?? 0}
            onpick={(k: number) => (highlightPick = k)}
          />
        {/if}
        {#if legs.length > 1}
          <div role="group" aria-label="Leg" class="flex flex-wrap gap-1 p-1 bg-bg rounded-[10px]">
            {#each legs as l (l)}
              <button
                type="button"
                aria-pressed={l === leg}
                onclick={() => (legPick = l)}
                class="h-10 min-w-[72px] md:min-w-24 px-3 border-0 rounded-[7px] font-[inherit] text-[15px] cursor-pointer
                       {l === leg ? 'bg-accent text-accent-fg font-bold' : 'bg-transparent text-ink-2'}">Leg {l + 1}</button
              >
            {/each}
          </div>
        {:else}
          <span class="text-[14px] text-text-muted">Leg 1</span>
        {/if}
      </div>
    {/if}
  </div>

  <div id="{id}-panel" role="tabpanel" aria-labelledby="{id}-{view}" class="flex flex-col gap-4 min-w-0">
    {#if view === 'legs'}
      <X01Legs {detail} {party} {leg} {highlight} />
    {:else}
      <HeatmapView {detail} picked={heatPick} onpick={(s: number) => (heatPick = s)} />
    {/if}
  </div>
</section>
