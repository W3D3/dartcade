<script lang="ts">
  // One stat of a duel: left value, the label over a two-part bar, right value (the win screen's
  // Match stats and the details page's Statistics). The left side is lime, as on the win screen;
  // with `best` (the details page) the better value is lime instead and the other one muted.
  let { label, values, share, best }: { label: string; values: [string, string]; share: number; best?: [boolean, boolean] } = $props()
  const lit = $derived<[boolean, boolean]>(best ?? [true, false])
</script>

<!-- "50% · 3/6": phones keep the rate, the tally doesn't fit their value column -->
{#snippet value(v: string)}
  {@const [head, ...tail] = v.split(' · ')}
  {head}{#if tail.length}<span class="max-md:hidden">{` · ${tail.join(' · ')}`}</span>{/if}
{/snippet}

<div
  role="group"
  aria-label="{label}: {values[0]} against {values[1]}"
  class="w-full max-w-[760px] mx-auto grid grid-cols-[80px_minmax(0,1fr)_80px] md:grid-cols-[112px_minmax(0,1fr)_112px] xl:grid-cols-[150px_minmax(0,1fr)_150px] items-center gap-3 xl:gap-4 h-[46px] xl:h-[54px]"
>
  <span
    aria-hidden="true"
    class="text-right whitespace-nowrap font-display font-bold text-[26px] md:text-[30px] {lit[0] ? 'text-accent' : 'text-text-muted'}"
    >{@render value(values[0])}</span
  >
  <span aria-hidden="true" class="flex flex-col gap-[5px]">
    <span class="text-center text-caption tracking-cta uppercase text-text-muted">{label}</span>
    <span class="flex h-[6px] rounded-[3px] overflow-hidden bg-line">
      <span class="bg-accent" style:width="{Math.round(share * 100)}%"></span>
      <span class="grow bg-line-chip ml-[2px]"></span>
    </span>
  </span>
  <span
    aria-hidden="true"
    class="whitespace-nowrap font-display font-bold text-[26px] md:text-[30px] {lit[1] ? 'text-accent' : 'text-text-muted'}"
    >{@render value(values[1])}</span
  >
</div>
