<script lang="ts">
  // One stat of a duel: left value, the label over a two-part bar, right value (the win screen's
  // Match stats and the details page's Statistics). Without `colors` the left side is lime, as on
  // the win screen; with them each side's bar and its better value take that side's colour.
  let {
    label,
    values,
    share,
    colors,
    best = [false, false],
    size = 'lg',
  }: {
    label: string
    values: [string, string]
    share: number
    colors?: [string, string]
    best?: [boolean, boolean]
    size?: 'lg' | 'md'
  } = $props()
  const VALUE = $derived(
    size === 'lg' ? 'font-display font-bold text-[26px] md:text-[30px]' : 'font-display font-bold text-[20px] md:text-[22px]',
  )
  const dim = (i: 0 | 1) => (colors && !best[i] ? 0.45 : 1)
</script>

<!-- "50% · 3/6": phones keep the rate, the tally doesn't fit their value column -->
{#snippet value(v: string)}
  {@const [head, ...tail] = v.split(' · ')}
  {head}{#if tail.length}<span class="max-md:hidden">{` · ${tail.join(' · ')}`}</span>{/if}
{/snippet}

<div
  role="group"
  aria-label="{label}: {values[0]} against {values[1]}"
  class="w-full max-w-[760px] mx-auto grid items-center gap-3 xl:gap-4
    {size === 'lg'
    ? 'grid-cols-[80px_minmax(0,1fr)_80px] md:grid-cols-[112px_minmax(0,1fr)_112px] xl:grid-cols-[150px_minmax(0,1fr)_150px] h-[46px] xl:h-[54px]'
    : 'grid-cols-[84px_minmax(0,1fr)_84px] md:grid-cols-[120px_minmax(0,1fr)_120px] h-[46px]'}"
>
  <span
    aria-hidden="true"
    class="text-right whitespace-nowrap {VALUE} {colors ? (best[0] ? '' : 'text-text-muted') : 'text-accent'}"
    style:color={colors && best[0] ? colors[0] : undefined}>{@render value(values[0])}</span
  >
  <span aria-hidden="true" class="flex flex-col gap-[5px]">
    <span class="text-center text-caption tracking-cta uppercase text-text-muted">{label}</span>
    <span class="flex h-[6px] rounded-[3px] overflow-hidden bg-line">
      <span class={colors ? '' : 'bg-accent'} style:width="{Math.round(share * 100)}%" style:background={colors?.[0]} style:opacity={dim(0)}
      ></span>
      <span class="grow ml-[2px] {colors ? '' : 'bg-line-chip'}" style:background={colors?.[1]} style:opacity={dim(1)}></span>
    </span>
  </span>
  <span
    aria-hidden="true"
    class="whitespace-nowrap {VALUE} {colors && best[1] ? '' : 'text-text-muted'}"
    style:color={colors && best[1] ? colors[1] : undefined}>{@render value(values[1])}</span
  >
</div>
