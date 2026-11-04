<script lang="ts">
  // A visit explained to the player (Coach-Leg's selected visit, the sandbox): each dart in its tile's
  // tone, its class and how far it missed its target's bed, then the Better (or Tip) line of the note
  // it explains.
  import type { ReviewVisit } from '$shared/coach'
  import { betterLine } from '$lib/coach/board'
  import { dartRows } from '$lib/coach/dart'
  import DartTile from './DartTile.svelte'
  import Pill from './Pill.svelte'

  let { visit }: { visit: Pick<ReviewVisit, 'n' | 'darts' | 'explained'> } = $props()
  const note = $derived(visit.explained)
</script>

<div class="flex flex-col gap-2 text-[13.5px] leading-[1.45]">
  <table class="w-full border-collapse text-[13px] tabular-nums">
    <caption class="sr-only">Visit {visit.n}'s darts</caption>
    <thead>
      <tr class="text-left text-[11px] uppercase tracking-[0.08em] text-text-muted">
        <th scope="col" class="py-1 pr-2 font-semibold">Dart</th>
        <th scope="col" class="py-1 pr-2 font-semibold">Classification</th>
        <th scope="col" class="py-1 text-right font-semibold">Distance</th>
      </tr>
    </thead>
    <tbody>
      {#each dartRows(visit) as r, i (i)}
        <tr class="border-t border-line align-top">
          <th scope="row" class="py-1.5 pr-2 text-left"><DartTile tile={r.tile} compact /></th>
          <td class="py-1.5 pr-2"
            >{r.tile.label}{#if r.near}&nbsp;<Pill label="Near miss" tone="good" />{/if}</td
          >
          <td class="py-1.5 text-right whitespace-nowrap">{r.distance}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if note}<span class="text-ice"><b>{note.tip ? 'Tip:' : 'Better:'}</b> {betterLine(note)}</span>{/if}
</div>
