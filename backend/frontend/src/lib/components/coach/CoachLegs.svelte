<script lang="ts">
  // The coach's legs (Coach-Leg "Every visit" rows; phones: Coach-Phone-Leg's visit cards): each
  // of the player's visits as left → darts → scored → then, with its strategy notes beside it.
  import type { CoachLeg, CoachNote } from '$shared/coach'
  import { visitStart } from '$shared/coach/visitStart'

  let { legs, seat, notes }: { legs: readonly CoachLeg[]; seat: number; notes: CoachNote[] } = $props()

  const pct = (x: number) => `${Math.round(x * 100)}%`
  const notesFor = (leg: number, visit: number) => notes.filter(n => n.leg === leg && n.visit === visit)
  const ROW = 'md:grid md:grid-cols-[34px_58px_176px_56px_52px_minmax(0,1fr)] md:gap-[14px] md:items-center'
  const NUM = 'font-display font-bold text-[20px] md:text-[24px] leading-none'
</script>

{#each legs as leg (leg.leg)}
  {@const mine = leg.visits.map((v, i) => ({ v, i })).filter(x => x.v.seat === seat)}
  <div class="flex flex-col gap-2 min-w-0">
    <h3 class="m-0 font-display font-bold text-[14px] tracking-[0.06em] uppercase text-text-dim">Leg {leg.leg + 1}</h3>
    {#if !notes.some(n => n.leg === leg.leg)}
      <p class="m-0 text-[13px] text-text-dim">No strategy notes</p>
    {/if}
    <div class="{ROW} max-md:hidden px-[14px] text-[12px] label-caps text-text-dim" aria-hidden="true">
      <span>#</span><span class="text-right">Left</span><span>Darts</span><span class="text-right">Scored</span><span class="text-right"
        >Then</span
      ><span>Coach</span>
    </div>
    <ol class="m-0 p-0 list-none flex flex-col gap-2 md:gap-1">
      {#each mine as { v, i }, n (i)}
        {@const vnotes = notesFor(leg.leg, i)}
        <li
          id="coach-{leg.leg}-{i}"
          class="{ROW} flex flex-col gap-2 p-3 md:px-[14px] rounded-[12px] border scroll-mt-4
                 {vnotes.length ? 'bg-surface-panel border-checkout-line' : 'border-line max-md:bg-surface-panel md:border-transparent'}"
        >
          <div class="flex items-center gap-[10px] md:contents">
            <span class="{NUM} text-text-dim md:text-[20px] w-[18px] md:w-auto">{n + 1}</span>
            <span class="{NUM} text-right max-md:hidden">{visitStart(v)}</span>
            <span class="flex gap-[5px] md:gap-[6px]">
              {#each v.darts as d, di (di)}
                <span
                  class="inline-flex items-center justify-center min-w-[46px] h-[30px] px-1.5 box-border rounded-[7px] font-display font-bold text-[18px]
                         {d.segment.multiplier === 0
                    ? 'border-[1.5px] border-dashed border-danger-line text-live-text'
                    : d.segment.multiplier === 3
                      ? 'bg-accent-tint text-accent'
                      : 'bg-surface-paused text-ink-2'}">{d.segment.multiplier === 0 ? 'Miss' : d.segment.name}</span
                >
              {/each}
            </span>
            <span class="ml-auto md:ml-0 flex flex-col items-end">
              <span class="{NUM} {v.bust ? 'text-live-text' : ''}">{v.bust ? 'Bust' : v.scored}</span>
              <span class="md:hidden text-[11px] text-text-dim">{visitStart(v)} → {v.remaining}</span>
            </span>
            <span class="{NUM} text-right text-text-muted max-md:hidden">{v.remaining}</span>
          </div>
          {#if vnotes.length}<div class="flex flex-col gap-1.5 min-w-0">
              {#each vnotes as note (note.dart)}
                <p class="m-0 text-[13px] md:text-[13.5px] leading-[1.45] text-ink-2">
                  <b class="text-ice">Better: {note.better}</b>
                  <span class="text-text-dim">· on {note.left}, instead of {note.thrown}</span><br />
                  {#if note.reason}{note.reason} <span class="text-text-dim">·</span>{/if}
                  <span class="text-text-dim">−{pct(note.cost)} checkout chance</span>
                  {#if note.book}<br /><span class="text-text-dim">The book plays {note.book.join(' · ')}</span>{/if}
                </p>
              {/each}
            </div>{/if}
        </li>
      {/each}
    </ol>
  </div>
{/each}
