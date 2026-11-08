<script lang="ts">
  // Ranks (MM-Ranks board): your rank in each mode with its progress to the next stage, how ranks
  // move, and every tier and stage with the RP it starts at, in six columns from Wood to Elite.
  // Your stages are filled and marked 1v1 / 2v2 on the ladder.
  import { onMount } from 'svelte'
  import { ChevronLeft } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import RankBadge from '$lib/components/ranked/RankBadge.svelte'
  import { api } from '$lib/api'
  import type { components } from '$lib/api/schema'
  import { DEMOTION_BUFFER, PLACEMENT_MATCHES } from '$shared/ranked.js'
  import { TIER_TEXT, TIER_TINT, ladder, ratingCard, stageThreshold } from '$lib/ranked/view'

  type Rating = components['schemas']['RankedRating']

  let ratings = $state<Rating[] | null>(null)
  let error = $state('')
  const tiers = ladder()
  const cards = $derived((ratings ?? []).map(r => ({ mode: r.mode, ...ratingCard(r), rankIndex: r.rankIndex })))

  onMount(async () => {
    const { data, error: err } = await api.GET('/api/ranked/me')
    if (data) ratings = data.ratings
    else error = err.error
  })

  const modesAt = (index: number) => cards.filter(c => c.rankIndex === index).map(c => c.mode)

  const rules = [
    {
      title: 'Placement',
      text: `Your first ${PLACEMENT_MATCHES} ranked matches in a mode place you. Your rating moves twice as fast while you place.`,
    },
    { title: 'Moving up', text: 'You promote the moment your rating reaches the next stage.' },
    {
      title: 'Moving down',
      text: `You only drop a stage after falling ${DEMOTION_BUFFER} RP below it, so one loss never demotes you on the spot.`,
    },
  ]
</script>

<Layout title="Ranks">
  <main
    class="flex grow min-h-0 flex-col gap-[14px] md:gap-[22px] box-border min-w-0 overflow-y-auto px-4 pt-[14px] pb-5 md:px-[30px] md:py-7 xl:px-10 xl:py-9"
  >
    <header class="flex flex-col gap-[6px]">
      <a href="#/matchmaking" class="flex items-center gap-1 text-[14px] font-semibold text-text-muted no-underline"
        ><ChevronLeft size={16} />Matchmaking</a
      >
      <h1 class="hidden md:block font-display font-bold text-[42px] xl:text-[48px] leading-none uppercase tracking-title">Ranks</h1>
      <p class="text-[15px] text-text-muted">
        Six tiers with five stages each. Your rank follows your rating, and solo 1v1 and duo 2v2 are ranked separately.
      </p>
    </header>

    {#if error}<ErrorText>{error}</ErrorText>{/if}

    <div class="grid gap-[14px] md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr]">
      {#each cards as c (c.mode)}
        <section
          aria-label="Your rank · {c.mode}: {c.title}"
          class="flex items-center gap-4 rounded-card border border-line bg-surface-panel px-[18px] py-4 xl:gap-[18px] xl:px-5"
        >
          <RankBadge rank={c.rank} size={66} />
          <div class="flex min-w-0 grow flex-col gap-[6px]">
            <span class="text-[12px] label-caps text-text-muted">Your rank · {c.mode}</span>
            <span class="flex items-baseline gap-3">
              <span
                class="whitespace-nowrap font-display text-[26px] font-bold uppercase leading-none xl:text-[30px]"
                style:color={c.rank ? TIER_TEXT[c.rank.tier] : undefined}>{c.title}</span
              >
              <span class="whitespace-nowrap text-[15px]">{c.rating} <span class="text-text-dim">{c.unit}</span></span>
            </span>
            {#if c.bar && c.rank}
              <div
                role="progressbar"
                aria-label="Progress to {c.bar.next.name}"
                aria-valuenow={c.bar.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                class="h-2 overflow-hidden rounded-[4px] bg-surface-active"
              >
                <span class="block h-full rounded-[4px]" style:width="{c.bar.percent}%" style:background={TIER_TEXT[c.rank.tier]}></span>
              </div>
              <span class="flex justify-between gap-2 whitespace-nowrap text-[12px] text-text-dim">
                <span>{c.bar.from}</span>
                <span><strong class="font-semibold text-text">{c.bar.missing}</strong> to {c.bar.next.name}</span>
              </span>
            {:else}
              <span class="text-[12px] text-text-dim">{c.progress.replace(/^· /, '')}</span>
            {/if}
          </div>
        </section>
      {/each}
      <section class="flex flex-col gap-2 rounded-card border border-line bg-surface-panel px-[18px] py-4 md:col-span-2 xl:col-span-1">
        {#each rules as r (r.title)}
          <p class="text-[13px] text-ink-2"><strong class="font-semibold text-text">{r.title}</strong> · {r.text}</p>
        {/each}
      </section>
    </div>

    <!-- Six columns side by side; narrower screens scroll sideways, a column never squeezed below 176 px -->
    <div
      aria-label="All ranks and the RP needed"
      class="grid min-h-0 shrink-0 snap-x auto-cols-[minmax(176px,1fr)] grid-flow-col gap-[10px] overflow-x-auto pb-1 md:grow"
    >
      {#each tiers as t (t.tier)}
        <section
          aria-label="{t.tier}: {t.range} RP"
          style:background="linear-gradient(180deg, {TIER_TINT[t.tier]}22, var(--color-surface-panel) 46%)"
          class="box-border flex snap-start flex-col gap-[10px] rounded-card border border-line px-[10px] pb-[10px] pt-[14px]"
        >
          <div class="flex flex-col items-center gap-[6px] text-center">
            <RankBadge rank={t.stages[0]} size={66} />
            <h2 class="font-display text-[26px] font-bold uppercase leading-none tracking-[0.03em]" style:color={TIER_TEXT[t.tier]}>
              {t.tier}
            </h2>
            <span class="font-mono text-[12px] text-ink-2">{t.range}</span>
          </div>
          <ol class="flex flex-col gap-[6px] border-t border-line p-0 pt-[6px]">
            {#each t.stages as s (s.index)}
              {@const mine = modesAt(s.index)}
              <li
                aria-label="{s.name}: from {stageThreshold(s)}{mine.length ? `; your ${mine.join(' and ')} rank` : ''}"
                class="relative flex h-[54px] items-center gap-[9px] rounded-md pl-[6px] pr-2 {mine.length
                  ? 'bg-surface-picked shadow-[inset_0_0_0_1.5px_var(--color-accent)]'
                  : ''}"
              >
                <RankBadge rank={s} size={38} />
                <span class="flex min-w-0 grow flex-col gap-[2px]">
                  <span class="whitespace-nowrap text-[14px] font-semibold text-text">{s.name}</span>
                  <span class="whitespace-nowrap text-[12px] {mine.length ? 'text-text' : 'text-text-dim'}">{stageThreshold(s)}</span>
                </span>
                {#if mine.length}
                  <span
                    class="absolute top-[-9px] right-2 inline-flex h-[18px] items-center whitespace-nowrap rounded-chip bg-accent px-[7px] text-[11px] font-bold text-accent-fg"
                    >{mine.join(' · ')}</span
                  >
                {/if}
              </li>
            {/each}
          </ol>
        </section>
      {/each}
    </div>
  </main>
</Layout>
