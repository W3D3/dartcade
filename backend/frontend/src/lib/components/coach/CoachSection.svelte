<script lang="ts">
  // The coach (Coach-Leg / Coach-Phone-Leg artboards, trimmed to the leg review): a player's
  // strategy notes on a finish, their execution stats and where they miss, for one finished X01
  // game. The model is loaded only when the section shows.
  import type { GameDetail } from '$lib/api'
  import { querystring } from 'svelte-spa-router'
  import { flag } from '$lib/flags'
  import { coachable, coachSeats, defaultCoachSeat } from '$lib/coach/view'
  import { averageForLevel } from '$shared/botLevels'
  import type { CoachLeg, CoachReport, coachGame as CoachGame } from '$shared/coach'
  import CoachLegs from './CoachLegs.svelte'

  let { detail }: { detail: GameDetail } = $props()
  const enabled = flag('coach.enabled')

  const x01 = $derived(detail.detail.mode === 'x01' ? detail.detail : null)
  const seats = $derived(coachSeats(detail.game))
  const show = $derived($enabled && x01 !== null && coachable(detail.game) && seats.length > 0)
  let picked = $state<number | null>(null)
  const seat = $derived(picked ?? defaultCoachSeat(detail.game) ?? 0)
  const nameOf = (s: number) => detail.game.players.find(p => p.seat === s)?.name ?? `Seat ${s + 1}`
  // Headings speak to you on your own darts, and name the player on someone else's
  const other = $derived(seat === detail.game.mySeat ? null : nameOf(seat))
  const startScore = $derived(typeof detail.game.config.startScore === 'number' ? detail.game.config.startScore : 501)

  // Each seat's report per game (its legs), worked out on first view: switching players back
  // doesn't run the model again. startScore comes from the same detail as the legs.
  // Plain, not reactive: it is filled while rendering
  const reports = new WeakMap<readonly CoachLeg[], (CoachReport | undefined)[]>()
  function reportFor(run: typeof CoachGame, legs: readonly CoachLeg[], s: number): CoachReport {
    let bySeat = reports.get(legs)
    if (!bySeat) reports.set(legs, (bySeat = []))
    return (bySeat[s] ??= run(legs, s, startScore))
  }

  // Loaded only once the section shows, so the model's tables stay out of the page's bundle
  const coach = $derived(show ? import('$shared/coach') : null)
  // ?coach (the coach's links): open the page here, once, when the section first shows. Flags load
  // after the page, so this can't run from the page's own load.
  let scrolled = false
  $effect(() => {
    if (scrolled || !coach || !new URLSearchParams($querystring ?? '').has('coach')) return
    scrolled = true
    document.getElementById('coach')?.scrollIntoView({ block: 'start' })
  })
  const pct = (x: number) => `${Math.round(x * 100)}%`
  const jump = (e: MouseEvent, id: string) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ block: 'center' })
  }
  const KPI = 'flex flex-col gap-1.5 p-4 rounded-[12px] bg-surface-panel border border-line min-w-0'
  const LAB = 'text-[12px] label-caps text-text-dim'
  const BIG = 'font-display font-bold text-[28px] md:text-[34px] leading-none'
</script>

{#if x01 && coach}
  <section id="coach" aria-label="Coach" class="flex flex-col gap-4 min-w-0 box-border p-4 md:p-6 card scroll-mt-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="m-0 font-display font-bold text-[24px] md:text-[32px] uppercase leading-none">Coach</h2>
      {#if seats.length > 1}
        <div role="group" aria-label="Player" class="flex flex-wrap gap-1 p-1 bg-bg rounded-[10px]">
          {#each seats as s (s)}
            <button
              type="button"
              aria-pressed={s === seat}
              onclick={() => (picked = s)}
              class="h-10 min-w-[72px] md:min-w-24 px-3 border-0 rounded-[7px] font-[inherit] text-[15px] cursor-pointer
               {s === seat ? 'bg-accent text-accent-fg font-bold' : 'bg-transparent text-ink-2'}">{nameOf(s)}</button
            >
          {/each}
        </div>
      {/if}
    </div>

    {#await coach}
      <p class="m-0 text-[13px] text-text-dim">Loading the coach…</p>
    {:then { coachGame, LANDING_LEVEL }}
      {@const report = reportFor(coachGame, x01.legs, seat)}
      {@const biggest = [...report.notes].sort((a, b) => b.cost - a.cost).slice(0, 3)}
      {@const tendencies = report.tendencies.filter(t => t.darts >= 6)}
      <p class="m-0 text-[13px] text-text-dim">
        Notes judge every dart on a finish against a {averageForLevel(LANDING_LEVEL)}-average player's chances.
      </p>

      <dl class="m-0 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class={KPI}>
          <dt class={LAB}>Average until 170</dt>
          <dd class="m-0 {BIG}">{report.stats.scoringAverage?.toFixed(1) ?? '–'}</dd>
        </div>
        <div class={KPI}>
          <dt class={LAB}>Darts per checkout</dt>
          <dd class="m-0 {BIG}">{report.stats.checkouts ? (report.stats.dartsAtDouble / report.stats.checkouts).toFixed(1) : '–'}</dd>
        </div>
        <div class={KPI}>
          <dt class={LAB}>Busts</dt>
          <dd class="m-0 {BIG}">{report.stats.busts}</dd>
        </div>
        <div class={KPI}>
          <dt class={LAB}>Doubles</dt>
          <dd class="m-0 text-[14px] leading-[1.45] text-ink-2">
            {report.stats.doubles.map(d => `${d.target} ${d.hits}/${d.darts}`).join(', ') || '–'}
          </dd>
        </div>
      </dl>

      {#if biggest.length}
        <div class="flex flex-col gap-1">
          <h3 class="m-0 text-[15px] font-semibold">{other ? `${other}'s biggest mistakes` : 'Biggest mistakes'}</h3>
          {#each biggest as n (`${n.leg}-${n.visit}-${n.dart}`)}
            <a
              class="text-[14px] font-semibold text-accent hover:text-accent-hover no-underline"
              href="#coach-{n.leg}-{n.visit}"
              onclick={e => jump(e, `coach-${n.leg}-${n.visit}`)}
            >
              Leg {n.leg + 1}, on {n.left}: {n.thrown}, better {n.better} (−{pct(n.cost)})
            </a>
          {/each}
        </div>
      {/if}

      {#if tendencies.length}
        <div class="flex flex-col gap-1">
          <h3 class="m-0 text-[15px] font-semibold">{other ? `Where ${other} misses` : 'Where you miss'}</h3>
          {#each tendencies as t (t.aim)}
            <p class="m-0 text-[13px] leading-[1.45]">
              <span class="font-semibold">{t.aim}</span>
              <span class="text-text-dim">
                · {t.aim.slice(1)}: {pct(t.on / t.darts)}
                {#each t.wedges.slice(0, 2) as w (w.number)}
                  · {w.number}: {pct(w.darts / t.darts)}{/each}
                {#if t.positioned}
                  · inside {pct(t.inside / t.positioned)}, outside {pct(t.outside / t.positioned)} of {t.positioned} camera darts{/if}
                · {t.darts} darts
              </span>
            </p>
          {/each}
        </div>
      {/if}

      <CoachLegs legs={x01.legs} {seat} notes={report.notes} />
    {:catch}
      <p class="m-0 text-[13px] text-text-dim">The coach couldn't load. Reload the page to try again.</p>
    {/await}
  </section>
{/if}
