<script lang="ts">
  // The run is over (Dungeon-Pixel-Victory, -Defeat and their phone boards): won when the boss fell, lost
  // when the party did. While the deciding visit waits for Finish: the result, the party (cheering, or
  // fallen before the boss), what the run came to, the visit that decided it, Undo and Finish. Once
  // finished GameDisplay shows the summary with its buttons. Not on the artboards, which the run's data
  // doesn't back: XP (a Dungeon run pays none), the run's time and what each hero fell to.
  import { Crown, CircleDollarSign, Swords } from '@lucide/svelte'
  import type { DungeonGame } from '$lib/api/game-ws'
  import ControlBar from '$lib/components/ControlBar.svelte'
  import type { MatchControls } from '$lib/components/match/types'
  import { traceLines } from '$lib/dungeon/battle'
  import { classOf } from '$lib/dungeon/view'
  import { CLASSES } from '$shared/dungeon/content/classes'
  import { ENEMIES } from '$shared/dungeon/content/enemies'
  import PixelSprite from './PixelSprite.svelte'

  let {
    game,
    names,
    canUndo,
    next,
    onUndo,
    onNext,
    viewOnly = false,
  }: Pick<MatchControls, 'canUndo' | 'next' | 'onUndo' | 'onNext' | 'viewOnly'> & { game: DungeonGame; names: string[] } = $props()
  const won = $derived(game.outcome === 'victory')
  const boss = ENEMIES.dungeonWarden.name
  const log = $derived(won && game.trace ? traceLines(game.trace, names[game.trace.seat] ?? '', []) : [])
  const total = $derived(game.summary?.heroes.reduce((n, h) => n + h.damage, 0) ?? 0)
  const bossHp = $derived(game.battle?.room === 'boss' ? game.battle.enemies.reduce((n, e) => n + e.hp, 0) : 0)
  const heroes = $derived(game.heroes.map(h => ({ ...h, classId: classOf(h) })))
  const fmt = (n: number) => n.toLocaleString('en')
  // The artboard's confetti: a fixed scatter so a snapshot looks the same every time
  const CONFETTI = Array.from({ length: 32 }, (_, i) => ({
    left: (i * 97) % 100,
    top: (i * 53 + 11) % 62,
    size: 6 + (i % 3) * 2,
    rotate: (i * 37) % 90,
    colour: ['#f2c14e', '#ff8a80', '#4cc38a', '#4b9bff', '#b66bff', '#f0e8d8'][i % 6],
  }))
</script>

<main
  class="relative flex h-full flex-col items-center justify-center gap-5 overflow-y-auto overflow-x-hidden p-4 text-center text-dg-text md:gap-7 md:p-8 {won
    ? 'bg-[radial-gradient(ellipse_at_50%_45%,#3a2f12_0%,#1a1420_60%,#0e0a14_100%)]'
    : 'bg-[radial-gradient(ellipse_at_50%_40%,#2a1018_0%,#140e18_60%,#0a070e_100%)]'}"
  data-testid="dungeon-end"
>
  {#if won}
    {#each CONFETTI as c, i (i)}
      <span
        aria-hidden="true"
        class="absolute opacity-85"
        style:left="{c.left}%"
        style:top="{c.top}%"
        style:width="{c.size}px"
        style:height="{c.size}px"
        style:background={c.colour}
        style:transform="rotate({c.rotate}deg)"
      ></span>
    {/each}
  {/if}
  <div class="relative flex flex-col items-center gap-1.5">
    <h2
      class="font-display text-6xl font-bold uppercase leading-none tracking-wordmark md:text-hero {won ? 'text-dg-gold' : 'text-dg-hp'}"
      style:text-shadow="0 6px 0 #0e0a14, 0 0 40px {won ? '#f2c14e66' : '#e0463c66'}"
    >
      {won ? 'Victory' : 'Defeated'}
    </h2>
    <p class="text-base md:text-lg">
      {won
        ? `The ${boss} falls. Act 1 is cleared.`
        : `The party fell on floor ${game.floor}.${bossHp > 0 ? ` The ${boss} had ${fmt(bossHp)} HP left.` : ''}`}
    </p>
  </div>

  <div
    class="relative flex items-end gap-2 [--u:3px] min-[400px]:gap-3 min-[400px]:[--u:4px] md:gap-10 md:[--u:6px] {won ? '' : 'md:mt-6'}"
  >
    {#if won}
      {#each heroes as h, i (h.seat)}
        {#if h.classId}
          <span class="dg-bob inline-flex" style:animation-delay="-{i * 0.3}s"
            ><PixelSprite id={h.classId} scale="fluid" shadow label={names[h.seat]} /></span
          >
        {/if}
      {/each}
      <span class="inline-flex rotate-90 opacity-80 grayscale brightness-[.6]"
        ><PixelSprite id="dungeonWarden" scale="fluid" class="scale-[.34]" /></span
      >
    {:else}
      <span class="inline-flex drop-shadow-[0_0_24px_rgba(224,70,60,.5)]"
        ><PixelSprite id="dungeonWarden" scale="fluid" shadow label={boss} class="scale-[.75]" /></span
      >
      <span class="flex items-end gap-2.5 md:ml-10">
        {#each heroes as h (h.seat)}
          {#if h.classId}
            <span class="inline-flex -rotate-90 grayscale-[.85] brightness-[.7]"
              ><PixelSprite id={h.classId} scale="fluid" shadow label="{names[h.seat]} has fallen" class="scale-[.85]" /></span
            >
          {/if}
        {/each}
      </span>
    {/if}
  </div>

  {#if won}
    <ul class="relative flex w-full max-w-[620px] gap-3 p-0">
      {#each [{ icon: Swords, value: fmt(total), label: 'total damage', tone: 'text-dg-gold' }, { icon: CircleDollarSign, value: fmt(game.gold), label: 'gold left', tone: 'text-dg-gold' }, { icon: Crown, value: 'Act 1', label: 'cleared', tone: 'text-[#ff9a90]' }] as t (t.label)}
        <li class="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border border-dg-line bg-dg-panel p-3 md:px-4">
          <t.icon class="size-5 {t.tone}" />
          <span class="font-display text-xl font-bold uppercase md:text-2xl {t.tone}">{t.value}</span>
          <span class="text-sm text-dg-muted">{t.label}</span>
        </li>
      {/each}
    </ul>
    {#if log.length}
      <ol class="relative max-w-2xl text-left font-mono text-sm text-dg-muted" data-testid="trace">
        {#each log as line, i (i)}<li>&gt; {line}</li>{/each}
      </ol>
    {/if}
  {:else}
    <ul class="relative flex w-full max-w-[560px] flex-col gap-2 p-0">
      {#each heroes as h (h.seat)}
        <li class="flex items-center gap-2.5 rounded-xl border border-dg-line bg-dg-panel px-3 py-2">
          <span class="flex h-[30px] w-[34px] justify-center overflow-hidden grayscale-[.85]">
            {#if h.classId}<PixelSprite id={h.classId} scale={2} />{/if}
          </span>
          <span class="font-display text-sm font-bold uppercase tracking-wider">{names[h.seat]}</span>
          <span class="ml-auto text-sm text-dg-muted">{h.classId ? CLASSES[h.classId].name : ''} · fell</span>
        </li>
      {/each}
    </ul>
    {#if log.length === 0 && game.gold > 0}<p class="relative text-sm text-dg-gold">{fmt(game.gold)} gold left unspent.</p>{/if}
  {/if}

  {#if !viewOnly}
    <div class="relative w-full max-w-md">
      <ControlBar
        {canUndo}
        label={next.label}
        prominent={next.prominent}
        enabled={next.enabled}
        {onUndo}
        {onNext}
        primary
        primaryTone="bg-dg-gold text-dg-bg hover:bg-dg-gold/90"
      />
    </div>
  {/if}
</main>

<style>
  @keyframes bob {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-6px);
    }
  }
  .dg-bob {
    animation: bob 1s steps(2, end) infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .dg-bob {
      animation: none;
    }
  }
</style>
