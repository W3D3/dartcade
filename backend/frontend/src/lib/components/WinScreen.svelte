<script lang="ts">
  // The match screen once a game is won: two sides face off around the score (a duel, or two
  // teams), three or more stand on a podium with the standings beside it. Confetti falls behind.
  import { Check, House, RotateCcwClock, Trophy } from '@lucide/svelte'
  import { ordinal } from '$lib/history'
  import type { Competitor, WinView } from '$lib/winScreen'

  let {
    view,
    title,
    meta,
    lobbyName,
    board,
    saved,
    doneLabel,
    ondone,
    onhistory,
  }: {
    view: WinView
    title: string
    meta: string
    lobbyName: string | null
    /** The board everyone threw on, if they shared one. */
    board: string | null
    /** The viewer played: the game is in their History. */
    saved: boolean
    doneLabel: string
    ondone: () => void
    onhistory: () => void
  } = $props()

  const winner = $derived(view.competitors[0])
  const second = $derived(view.competitors.at(1))
  const rest = $derived(view.competitors.slice(3))
  // The podium left to right: 2nd, 1st, 3rd (whoever there is)
  const podium = $derived(
    (
      [
        [1, 'second'],
        [0, 'first'],
        [2, 'third'],
      ] as const
    ).flatMap(([i, step]) => (view.competitors[i] ? [{ c: view.competitors[i], step }] : [])),
  )
  const step = {
    first: {
      ring: 'shadow-[0_0_0_4px_var(--color-bg),0_0_0_7px_var(--color-accent)]',
      block: 'h-[130px] md:h-[170px] xl:h-[210px] bg-linear-to-b from-accent-tint to-surface-active border-accent-line-strong',
      num: 'text-[96px] xl:text-[120px] text-accent',
      name: 'text-[22px] md:text-[36px] xl:text-[52px]',
      avatar: 'size-[84px] md:size-[112px] text-[36px] md:text-[46px]',
      delay: '',
    },
    second: {
      ring: 'shadow-[0_0_0_4px_var(--color-bg),0_0_0_7px_var(--color-text)]',
      block: 'h-[96px] md:h-[120px] xl:h-[150px] bg-linear-to-b from-surface-paused to-surface-2 border-line-chip',
      num: 'text-[72px] xl:text-[88px] text-text',
      name: 'text-[18px] md:text-[28px] xl:text-[36px]',
      avatar: 'size-[64px] md:size-[84px] text-[27px] md:text-[35px]',
      delay: 'r2',
    },
    third: {
      ring: 'shadow-[0_0_0_4px_var(--color-bg),0_0_0_7px_var(--color-warn)]',
      block: 'h-[70px] md:h-[86px] xl:h-[110px] bg-linear-to-b from-[#27251a] to-surface-2 border-warn-panel-line',
      num: 'text-[72px] xl:text-[88px] text-warn',
      name: 'text-[18px] md:text-[28px] xl:text-[36px]',
      avatar: 'size-[64px] md:size-[84px] text-[27px] md:text-[35px]',
      delay: 'r3',
    },
  }

  const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?'

  // Confetti: the same pieces every time (a fixed seed), spread across the width
  const COLORS = ['var(--color-accent)', 'var(--color-accent)', '#8fb23a', 'var(--color-warn)', 'var(--color-text)']
  const SHAPES = [
    [12, 6],
    [10, 16],
    [8, 8],
    [6, 14],
  ]
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const confetti = Array.from({ length: 46 }, () => {
    const [w, h] = SHAPES[Math.floor(rnd() * SHAPES.length)]
    return {
      left: rnd() * 100,
      w,
      h,
      color: COLORS[Math.floor(rnd() * COLORS.length)],
      dx: Math.round(rnd() * 220 - 110),
      rot: Math.round(rnd() * 1440 - 720),
      dur: 4.5 + rnd() * 3.5,
      delay: -rnd() * 8,
    }
  })
</script>

{#snippet avatar(c: { name: string; guest: boolean }, cls: string)}
  <span
    aria-hidden="true"
    class="shrink-0 box-border rounded-full flex items-center justify-center font-bold {cls}
           {c.guest ? 'border-[1.5px] border-dashed border-ink-faint text-ink-2' : 'bg-line-chip text-text'}">{initial(c.name)}</span
  >
{/snippet}

{#snippet who(c: Competitor)}
  {#if c.members.length}<span class="text-[14px] text-ink-2">{c.members.join(' & ')}</span>{/if}
{/snippet}

<div class="win relative flex-1 min-h-0 flex flex-col overflow-hidden">
  <div aria-hidden="true" class="absolute inset-0 overflow-hidden pointer-events-none">
    {#each confetti as p, i (i)}
      <span
        class="cf"
        style="left: {p.left}%; width: {p.w}px; height: {p.h}px; background: {p.color}; --dx: {p.dx}px; --rot: {p.rot}deg; --dur: {p.dur}s; --delay: {p.delay}s"
      ></span>
    {/each}
  </div>

  <header
    class="relative z-[2] shrink-0 box-border h-14 md:h-16 px-4 md:px-7 flex items-center gap-3 md:gap-4 border-b border-line bg-surface-1"
  >
    <h1 class="m-0 font-display font-bold text-[22px] md:text-[26px] uppercase tracking-[0.04em] leading-none shrink-0">{title}</h1>
    <span class="hidden md:inline text-[14px] text-text-muted truncate">{meta}</span>
    {#if lobbyName}
      <span
        title="Lobby game"
        class="hidden md:inline-flex shrink-0 max-w-[240px] h-7 px-[10px] items-center rounded-full bg-surface-active border border-accent-line text-accent text-[13px] font-semibold"
        ><span class="truncate">{lobbyName}</span></span
      >
    {/if}
    <span
      class="ml-auto shrink-0 h-[30px] px-3 inline-flex items-center gap-2 rounded-full bg-accent-tint text-accent text-[13px] font-bold tracking-[0.1em]"
    >
      <Check size={14} strokeWidth={3} />MATCH OVER
    </span>
    {#if board}<span class="hidden md:inline text-[14px] text-ink-2 shrink-0">{board}</span>{/if}
  </header>

  <main
    class="relative z-[1] flex-1 min-h-0 overflow-y-auto box-border px-4 py-4 md:px-8 md:pt-5 md:pb-4 xl:px-14 xl:pt-7 xl:pb-6 flex flex-col gap-[22px]"
  >
    {#if view.layout === 'duel'}
      <!-- Centred: with only the stats we keep, the duel doesn't fill a tall screen -->
      <div class="my-auto flex flex-col gap-[22px]">
        <section
          aria-label="{winner.name} wins"
          class="rise grid grid-cols-1 {second
            ? 'md:grid-cols-[1fr_auto_1fr]'
            : 'md:grid-cols-[auto_auto] md:justify-center'} items-center gap-5 md:gap-6 xl:gap-10"
        >
          <div class="flex items-center justify-center md:justify-end gap-4 md:gap-5">
            <div class="flex flex-col items-end gap-2 min-w-0">
              <span
                class="h-[30px] px-3 inline-flex items-center gap-[6px] rounded-full bg-accent text-accent-fg text-[13px] font-bold tracking-[0.1em] uppercase"
                ><Trophy size={16} />Winner</span
              >
              <span class="font-display font-bold text-[40px] md:text-[50px] xl:text-[64px] leading-[0.9] uppercase text-right break-words"
                >{winner.name}</span
              >
              {@render who(winner)}
              <span class="text-[15px] text-text-muted">{winner.sub}</span>
            </div>
            <span class="glow flex rounded-full shadow-[0_0_0_4px_var(--color-bg),0_0_0_7px_var(--color-accent)]">
              {@render avatar(winner, 'size-[84px] md:size-[120px] text-[36px] md:text-[50px]')}
            </span>
          </div>

          <div class="flex flex-col items-center gap-1">
            <span class="text-[13px] tracking-[0.14em] uppercase text-accent font-bold">{view.kicker}</span>
            {#if second}
              <span
                class="font-display font-bold text-[96px] md:text-[132px] xl:text-[168px] leading-[0.82] tracking-[0.01em] whitespace-nowrap"
              >
                <span class="text-accent">{winner.score}</span><span class="text-line-chip text-[0.6em] align-[0.25em]"> – </span><span
                  class="text-text-dim">{second.score}</span
                >
              </span>
            {/if}
            <span
              class={second
                ? 'text-[13px] tracking-[0.1em] uppercase text-text-dim'
                : 'font-display font-bold text-[56px] xl:text-[72px] leading-none uppercase'}>{view.scoreLabel}</span
            >
          </div>

          {#if second}
            <div class="flex items-center justify-center md:justify-start gap-4 md:gap-5 opacity-80">
              {@render avatar(second, 'size-[64px] md:size-[96px] text-[27px] md:text-[40px]')}
              <div class="flex flex-col gap-2 min-w-0">
                <span
                  class="self-start h-[30px] px-3 inline-flex items-center rounded-full border border-line-chip text-text-muted text-[13px] font-bold tracking-[0.1em] uppercase"
                  >{ordinal(second.placement)}</span
                >
                <span
                  class="font-display font-bold text-[32px] md:text-[38px] xl:text-[48px] leading-[0.9] uppercase text-ink-2 break-words"
                  >{second.name}</span
                >
                {@render who(second)}
                <span class="text-[15px] text-text-dim">{second.sub}</span>
              </div>
            </div>
          {/if}
        </section>

        {#if view.checkout}
          <p class="rise r2 -mt-[6px] mb-0 text-center text-[16px] md:text-[18px] text-ink-2">
            {view.checkout.name} checked out <strong class="text-text">{view.checkout.left}</strong> with
            <strong class="text-accent">{view.checkout.darts}</strong>
            {view.checkout.tail}
          </p>
        {/if}

        {#if view.legs.length}
          <section aria-label="Legs" class="rise r3 grid grid-cols-2 md:flex gap-[10px]">
            {#each view.legs as leg (leg.n)}
              <div
                class="md:flex-1 min-w-0 flex items-center gap-[10px] px-[14px] py-[10px] rounded-[12px] border
                        {leg.byWinner ? 'bg-surface-active border-accent-line' : 'bg-surface-panel border-line-2'}"
              >
                {@render avatar(leg, 'size-[30px] text-[13px]')}
                <span class="flex flex-col gap-px min-w-0">
                  <span class="text-[12px] tracking-[0.08em] uppercase text-text-dim truncate">Leg {leg.n} · {leg.name}</span>
                  <span class="text-[14px] truncate {leg.byWinner ? 'text-text' : 'text-ink-2'}">{leg.text}</span>
                </span>
              </div>
            {/each}
          </section>
        {/if}

        {#if second && view.stats.length}
          <section
            aria-label="Match stats, {winner.name} against {second.name}"
            class="rise r4 flex flex-col gap-[6px] px-4 md:px-7 py-[18px] rounded-[16px] bg-[rgba(21,23,19,0.88)] border border-line-2"
          >
            <div class="w-full max-w-[760px] mx-auto flex justify-between mb-[6px] text-[13px] text-text-dim">
              <span>{winner.name}</span><span class="tracking-[0.1em] uppercase">Match stats</span><span>{second.name}</span>
            </div>
            {#each view.stats as row (row.label)}
              <div
                class="w-full max-w-[760px] mx-auto grid grid-cols-[80px_minmax(0,1fr)_80px] md:grid-cols-[112px_minmax(0,1fr)_112px] xl:grid-cols-[150px_minmax(0,1fr)_150px] items-center gap-3 xl:gap-4 h-[46px] xl:h-[54px]"
              >
                <span class="text-right whitespace-nowrap font-display font-bold text-[26px] md:text-[30px] text-accent"
                  >{row.values[0]}</span
                >
                <span class="flex flex-col gap-[5px]">
                  <span class="text-center text-[12px] tracking-[0.08em] uppercase text-text-muted">{row.label}</span>
                  <span class="flex h-[6px] rounded-[3px] overflow-hidden bg-line">
                    <span class="bg-accent" style:width="{Math.round(row.share * 100)}%"></span>
                    <span class="grow bg-line-chip ml-[2px]"></span>
                  </span>
                </span>
                <span class="whitespace-nowrap font-display font-bold text-[26px] md:text-[30px] text-text-muted">{row.values[1]}</span>
              </div>
            {/each}
          </section>
        {/if}
      </div>
    {:else}
      <div class="rise flex flex-col items-center gap-1 text-center">
        <span class="text-[13px] tracking-[0.14em] uppercase text-accent font-bold">{view.kicker}</span>
        <h2 class="m-0 font-display font-bold text-[44px] md:text-[56px] xl:text-[72px] leading-[0.9] uppercase">{winner.name} wins</h2>
        <span class="text-[15px] md:text-[16px] text-text-muted">{view.note}</span>
      </div>

      <div class="flex-grow min-h-0 flex flex-col md:flex-row gap-[22px] xl:gap-8 md:items-stretch">
        <section
          aria-label="Podium: {podium.map(p => `${ordinal(p.c.placement)} ${p.c.name}`).join(', ')}"
          class="flex-1 min-w-0 flex flex-col justify-end"
        >
          <div class="flex items-end gap-[10px] md:gap-[14px]">
            {#each podium as { c, step: s } (s)}
              <div class="rise {step[s].delay} flex-1 min-w-0 flex flex-col items-center gap-3">
                <span class="flex rounded-full {step[s].ring} {s === 'first' ? 'glow' : ''}">
                  {@render avatar(c, step[s].avatar)}
                </span>
                <span class="max-w-full font-display font-bold leading-[0.9] uppercase text-center break-words {step[s].name}"
                  >{c.name}</span
                >
                <span class="text-[13px] md:text-[14px] text-text-muted text-center">{c.sub}</span>
                <div
                  class="w-full box-border rounded-t-[14px] rounded-b-[4px] border border-b-0 flex items-start justify-center pt-3 {step[s]
                    .block}"
                >
                  <span class="font-display font-bold leading-[0.85] {step[s].num}">{c.placement}</span>
                </div>
              </div>
            {/each}
          </div>
          {#if rest.length}
            <div class="rise r4 flex flex-col border-t-2 border-line-2 bg-surface-panel rounded-b-[12px]">
              {#each rest as c (c.seats[0])}
                <div class="flex items-center gap-[14px] h-[60px] px-[18px]">
                  <span class="w-11 font-display font-bold text-[30px] text-text-dim">{ordinal(c.placement)}</span>
                  {@render avatar(c, 'size-[34px] text-[14px]')}
                  <span class="text-[17px] font-semibold text-ink-2 truncate">{c.name}</span>
                  <span class="ml-auto text-[14px] text-text-dim whitespace-nowrap">{c.sub}</span>
                </div>
              {/each}
            </div>
          {/if}
        </section>

        <aside class="rise r3 md:w-[360px] xl:w-[420px] shrink-0 flex flex-col gap-[10px] xl:gap-[14px]">
          <section aria-label="Final standings" class="px-[18px] py-[14px] rounded-[16px] bg-[rgba(21,23,19,0.9)] border border-line-2">
            <div
              class="grid grid-cols-[40px_minmax(0,1fr)_56px_56px_56px] gap-2 pb-[6px] text-[11px] tracking-[0.08em] uppercase text-text-dim"
            >
              <span></span><span>Player</span>
              {#each view.columns as col (col)}<span class="text-right">{col}</span>{/each}
            </div>
            {#each view.competitors as c, i (c.seats[0])}
              <div
                class="grid grid-cols-[40px_minmax(0,1fr)_56px_56px_56px] items-center gap-2 h-10 text-[14px] {i <
                view.competitors.length - 1
                  ? 'border-b border-surface-paused'
                  : ''}"
              >
                <span class="font-display font-bold text-[20px] {i === 0 ? 'text-accent' : 'text-text-dim'}">{ordinal(c.placement)}</span>
                <span class="font-semibold truncate {i === 0 ? 'text-text' : 'text-ink-2'}">{c.name}</span>
                {#each c.cells as cell, j (j)}
                  <span class="text-right {j < 2 ? 'font-display font-bold text-[20px]' : 'text-text-muted'}">{cell}</span>
                {/each}
              </div>
            {/each}
          </section>

          {#if view.highlights.length}
            <section aria-label="Highlights" class="flex flex-col gap-2">
              <span class="text-[12px] tracking-[0.1em] uppercase text-text-muted">Highlights</span>
              {#each view.highlights as h (h.label)}
                <div class="flex items-center gap-3 px-[14px] py-3 rounded-[12px] bg-surface-panel border border-line-2">
                  {@render avatar(h, 'size-9 text-[15px]')}
                  <span class="flex flex-col gap-[2px] min-w-0">
                    <span class="text-[12px] tracking-[0.08em] uppercase text-accent">{h.label}</span>
                    <span class="text-[14px] text-ink-2">{h.name}: {h.text}</span>
                  </span>
                </div>
              {/each}
            </section>
          {/if}
        </aside>
      </div>
    {/if}
  </main>

  <footer
    class="rise r5 relative z-[2] shrink-0 box-border flex items-center gap-3 px-4 md:px-7 pt-[18px] pb-[calc(18px+env(safe-area-inset-bottom))] border-t border-line bg-surface-1"
  >
    {#if saved}
      <span class="hidden md:inline-flex items-center gap-2 text-[14px] text-text-muted"
        ><Check size={16} strokeWidth={2.6} class="text-accent" />Saved to History · counts in stats</span
      >
      <button
        type="button"
        onclick={onhistory}
        class="ml-auto h-14 px-[22px] flex items-center gap-[10px] rounded-[12px] border border-line-strong bg-transparent text-text text-[16px] font-semibold cursor-pointer hover:bg-surface-paused"
      >
        <RotateCcwClock size={20} />History
      </button>
    {/if}
    <button
      type="button"
      onclick={ondone}
      class="{saved
        ? ''
        : 'ml-auto'} flex-1 md:flex-none h-14 px-4 md:px-7 flex items-center justify-center gap-[10px] whitespace-nowrap rounded-[12px] border-0 bg-accent text-accent-fg font-display font-bold text-[19px] md:text-[22px] tracking-[0.06em] uppercase cursor-pointer hover:brightness-[1.08]"
    >
      <House size={20} strokeWidth={2.2} />{doneLabel}
    </button>
  </footer>
</div>

<style>
  .win {
    background: radial-gradient(900px 520px at 50% 18%, #1e2416 0%, var(--color-bg) 70%);
  }
  @keyframes fall {
    0% {
      transform: translate3d(0, -60px, 0) rotate(0deg);
      opacity: 0;
    }
    8% {
      opacity: 1;
    }
    100% {
      transform: translate3d(var(--dx), 110vh, 0) rotate(var(--rot));
      opacity: 0.9;
    }
  }
  .cf {
    position: absolute;
    top: 0;
    border-radius: 2px;
    animation: fall var(--dur) linear var(--delay) infinite;
  }
  @keyframes rise {
    from {
      transform: translateY(24px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  .rise {
    animation: rise 0.7s cubic-bezier(0.2, 0.8, 0.3, 1) both;
  }
  .r2 {
    animation-delay: 0.15s;
  }
  .r3 {
    animation-delay: 0.3s;
  }
  .r4 {
    animation-delay: 0.45s;
  }
  .r5 {
    animation-delay: 0.6s;
  }
  @keyframes glow {
    0%,
    100% {
      box-shadow:
        0 0 0 4px var(--color-bg),
        0 0 0 7px var(--color-accent),
        0 0 0 7px rgba(198, 242, 78, 0.45);
    }
    50% {
      box-shadow:
        0 0 0 4px var(--color-bg),
        0 0 0 7px var(--color-accent),
        0 0 0 21px rgba(198, 242, 78, 0);
    }
  }
  .glow {
    animation: glow 2.4s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .cf {
      display: none;
    }
    .rise,
    .glow {
      animation: none;
    }
  }
</style>
