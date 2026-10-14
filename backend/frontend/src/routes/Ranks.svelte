<script lang="ts">
  // Ranks (MM-Ranks board): your rank in each mode, how ranks move, and every tier and stage with
  // the RP it starts at. Your stages are marked 1v1 / 2v2 on the ladder.
  import { onMount } from 'svelte'
  import { ChevronLeft } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import RankBadge from '$lib/components/ranked/RankBadge.svelte'
  import { api } from '$lib/api'
  import type { components } from '$lib/api/schema'
  import { DEMOTION_BUFFER, PLACEMENT_MATCHES } from '$shared/ranked.js'
  import { TIER_COLOR, fmtRp, ladder, ratingCard } from '$lib/ranked/view'

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
    class="flex flex-grow flex-col gap-[14px] md:gap-[22px] box-border min-w-0 overflow-y-auto px-4 pt-[14px] pb-5 md:px-[30px] md:py-7 xl:px-10 xl:py-9"
  >
    <header class="flex flex-col gap-[6px]">
      <a href="#/matchmaking" class="flex items-center gap-1 text-[14px] font-semibold text-text-muted no-underline"
        ><ChevronLeft size={16} />Matchmaking</a
      >
      <h1 class="m-0 hidden md:block font-display font-bold text-[42px] xl:text-[48px] leading-none uppercase tracking-[0.02em]">Ranks</h1>
      <p class="m-0 text-[15px] text-text-muted">
        Six tiers with five stages each. Your rank follows your rating, and solo 1v1 and duo 2v2 are ranked separately.
      </p>
    </header>

    {#if error}<ErrorText>{error}</ErrorText>{/if}

    <div class="grid gap-[14px] md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr]">
      {#each cards as c (c.mode)}
        <section
          aria-label="Your rank · {c.mode}: {c.title}"
          class="flex items-center gap-4 rounded-[14px] border border-line bg-surface-panel px-[18px] py-4"
        >
          <RankBadge rank={c.rank} size={66} />
          <div class="flex min-w-0 flex-col gap-1">
            <span class="text-[12px] uppercase tracking-[0.1em] text-text-muted">Your rank · {c.mode}</span>
            <span class="font-display text-[28px] font-bold leading-none" style:color={c.rank ? TIER_COLOR[c.rank.tier] : undefined}
              >{c.title}</span
            >
            <span class="text-[13px] text-text-muted">{c.rating} {c.unit} <span class="text-text-dim">{c.progress}</span></span>
          </div>
        </section>
      {/each}
      <section class="flex flex-col gap-2 rounded-[14px] border border-line bg-surface-panel px-[18px] py-4 md:col-span-2 xl:col-span-1">
        {#each rules as r (r.title)}
          <p class="m-0 text-[13px] text-ink-2"><strong class="font-semibold text-text">{r.title}</strong> · {r.text}</p>
        {/each}
      </section>
    </div>

    <div class="grid gap-[14px] sm:grid-cols-2 xl:grid-cols-3">
      {#each tiers as t (t.tier)}
        <section
          aria-label="{t.tier}, {t.range} RP"
          class="flex flex-col gap-2 rounded-[14px] border border-line bg-surface-panel px-[18px] py-4"
        >
          <div class="flex items-baseline justify-between gap-2">
            <h2 class="m-0 font-display text-[24px] font-bold uppercase tracking-[0.03em]" style:color={TIER_COLOR[t.tier]}>{t.tier}</h2>
            <span class="font-mono text-[13px] text-text-muted">{t.range}</span>
          </div>
          <ul class="m-0 flex list-none flex-col p-0">
            {#each t.stages as s (s.index)}
              {@const mine = modesAt(s.index)}
              <li
                class="flex min-h-11 items-center gap-3 border-b border-surface-paused last:border-b-0 {mine.length
                  ? 'text-text'
                  : 'text-ink-2'}"
              >
                <RankBadge rank={s} size={34} />
                <span class="flex-grow text-[14px] font-semibold">{s.name}</span>
                {#each mine as m (m)}
                  <span class="rounded-[5px] border border-accent-line-strong px-[6px] py-[2px] text-[11px] font-semibold text-accent"
                    >{m}</span
                  >
                {/each}
                <span class="w-[70px] text-right font-mono text-[13px] text-text-muted">{s.index === 0 ? 'Start' : fmtRp(s.min)}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  </main>
</Layout>
