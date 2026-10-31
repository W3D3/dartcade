<script lang="ts">
  // X01 heatmap view (X01-Details-Heatmap/-Party-Heatmap/-Teams-Heatmap): player chips (teams
  // grouped under their heading), the heat board, the summary line and the four cards, then
  // the top 5 segments hit. One seat selected at a time; `x01Sides` already groups seats by
  // team when the game has them, so a "side" here is a team in a teams game and a lone player
  // otherwise, but the chips underneath it are always per-seat. The pick itself lives in the
  // caller (X01Section), the same way the leg and highlight picks do, so it survives this view
  // being remounted on a tab switch; `picked`/`onpick` default so this still works standalone
  // (e.g. in a test that renders HeatmapView on its own). `leg` is the shared leg selector on
  // X01Section's header: null for "Match" (every leg), or one leg's number.
  import type { GameDetail } from '$lib/api'
  import Avatar from '$lib/components/Avatar.svelte'
  import HeatBoard from './HeatBoard.svelte'
  import { groupingMm, heatmapLegLabel, heatSummary, inThe20, missSide, mostHit, seatDarts, trebles } from '$lib/details/heatmap'
  import { x01Sides } from '$lib/details/x01'
  import { highlightDefault } from '$lib/details/page'

  let {
    detail,
    picked = null,
    onpick,
    leg = null,
  }: { detail: GameDetail; picked?: number | null; onpick?: (seat: number) => void; leg?: number | null } = $props()

  const x01 = $derived(detail.detail.mode === 'x01' ? detail.detail : null)
  const sides = $derived(x01 ? x01Sides(detail.game, x01) : [])
  const players = $derived([...detail.game.players].sort((a, b) => a.seat - b.seat))
  const playerName = (seat: number) => players.find(p => p.seat === seat)?.name ?? ''
  const playerGuest = (seat: number) => {
    const p = players.find(p => p.seat === seat)
    return p !== undefined && p.userId === null && seat !== detail.game.mySeat
  }
  const playerBot = (seat: number) => players.find(p => p.seat === seat)?.bot ?? null

  const selectedSeat = $derived(picked ?? highlightDefault(detail))
  const name = $derived(playerName(selectedSeat))
  const darts = $derived(x01 ? seatDarts(x01, selectedSeat, leg) : [])

  const summaryFull = $derived(x01 ? heatSummary(name, heatmapLegLabel(leg, x01.legs.length), darts) : '')
  // heatSummary joins with the name verbatim first, so the rest of the line is everything after
  // it — letting the name alone render bold without re-deriving the join here.
  const summaryRest = $derived(summaryFull.slice(name.length))

  const in20 = $derived(inThe20(darts))
  const treb = $derived(trebles(darts))
  const miss = $derived(missSide(darts))
  const grouping = $derived(groupingMm(darts))
  const hits = $derived(mostHit(darts, 5))

  const in20Value = $derived(in20.pct === null ? '—' : `${in20.pct}%`)
  const in20Sub = $derived(`${in20.hits} of ${in20.total}`)
  const trebSub = $derived(treb.top ? `${treb.top.label} × ${treb.top.n}` : '—')
  const missValue = $derived(miss.side ?? '—')
  const missSub = $derived(
    miss.side === null ? '—' : miss.side === 'Left' ? `5 / 12 · ${miss.left} vs ${miss.right}` : `1 / 18 · ${miss.right} vs ${miss.left}`,
  )
  const groupingValue = $derived(grouping === null ? '—' : `${Math.round(grouping)} mm`)
  // Relative to the first (highest) row, as the artboard shades its Most hit bars.
  const barRatio = (n: number) => (hits.length > 0 && hits[0].n > 0 ? n / hits[0].n : 0)
  // A floor so the smallest bar stays readable, matching the artboard's opacity curve.
  const barOpacity = (n: number) => 0.35 + 0.65 * barRatio(n)
  const isTreble = (label: string) => /^T\d/.test(label)
</script>

{#if x01}
  <div class="flex flex-col gap-6">
    <div role="group" aria-label="Show heatmap for" class="flex flex-wrap gap-x-5 gap-y-3">
      {#each sides as side (side.key)}
        <div class="flex flex-wrap items-center gap-2">
          {#if x01.teams}
            <span class="font-display font-bold text-[14px] tracking-[0.06em] uppercase text-text-muted whitespace-nowrap">{side.name}</span
            >
          {/if}
          {#each side.seats as seat (seat)}
            <button
              type="button"
              aria-pressed={selectedSeat === seat}
              onclick={() => onpick?.(seat)}
              class="h-10 inline-flex items-center gap-2 pl-[5px] pr-3 rounded-full cursor-pointer font-[inherit] text-[14px] font-semibold text-text
                     {selectedSeat === seat ? 'border-2 border-accent bg-accent-tint' : 'border border-line-chip bg-transparent'}"
            >
              <Avatar name={playerName(seat)} guest={playerGuest(seat)} bot={playerBot(seat)} size={24} />
              {playerName(seat)}
            </button>
          {/each}
        </div>
      {/each}
    </div>

    <!-- Side by side once the section itself is wide enough (it sits in a narrow column next to
         the result card on most laptops), otherwise the cards go under the board. -->
    <div class="@container">
      <div class="flex flex-col gap-6 @min-[34rem]:flex-row @min-[34rem]:gap-8">
        <div class="min-w-0 max-w-[500px] @min-[34rem]:flex-[3_1_0%]">
          <HeatBoard {darts} {name} />
        </div>

        <div class="min-w-[11rem] flex flex-col gap-[18px] pt-1 @min-[34rem]:flex-[2_1_0%]">
          <p class="m-0 text-[15px] text-ink-2"><strong class="font-semibold text-text">{name}</strong>{summaryRest}</p>

          <div class="grid grid-cols-2 gap-x-4 gap-y-[18px]">
            <div class="flex flex-col gap-[3px] min-w-0">
              <span class="text-[11px] label-caps text-text-dim font-medium">In the 20</span>
              <span class="font-display font-bold text-[26px] leading-none text-accent">{in20Value}</span>
              <span class="text-[12px] text-text-dim">{in20Sub}</span>
            </div>
            <div class="flex flex-col gap-[3px] min-w-0">
              <span class="text-[11px] label-caps text-text-dim font-medium">Trebles</span>
              <span class="font-display font-bold text-[26px] leading-none text-text">{treb.count}</span>
              <span class="text-[12px] text-text-dim">{trebSub}</span>
            </div>
            <div class="flex flex-col gap-[3px] min-w-0">
              <span class="text-[11px] label-caps text-text-dim font-medium">Miss side</span>
              <span class="font-display font-bold text-[26px] leading-none text-text">{missValue}</span>
              <span class="text-[12px] text-text-dim">{missSub}</span>
            </div>
            <div class="flex flex-col gap-[3px] min-w-0">
              <span class="text-[11px] label-caps text-text-dim font-medium">Grouping</span>
              <span class="font-display font-bold text-[26px] leading-none text-text">{groupingValue}</span>
              <span class="text-[12px] text-text-dim">avg. spread</span>
            </div>
          </div>

          <div class="flex flex-col gap-[6px] pt-4 border-t border-line-2">
            <span class="text-[11px] label-caps text-text-dim font-medium">Most hit</span>
            <ol class="m-0 p-0 list-none flex flex-col gap-[2px]">
              {#each hits as h (h.label)}
                <li class="grid grid-cols-[44px_1fr_28px] items-center gap-[10px] h-7">
                  <span class="font-mono text-[13px] {isTreble(h.label) ? 'text-text font-bold' : 'text-ink-2 font-medium'}">{h.label}</span
                  >
                  <span class="h-2 rounded-[4px] bg-surface-chip overflow-hidden">
                    <span
                      class="block h-full rounded-[4px] bg-accent"
                      style="width: {Math.round(barRatio(h.n) * 100)}%; opacity: {barOpacity(h.n)}"
                    ></span>
                  </span>
                  <span class="text-right font-mono text-[13px] text-text-muted">{h.n}</span>
                </li>
              {/each}
            </ol>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
