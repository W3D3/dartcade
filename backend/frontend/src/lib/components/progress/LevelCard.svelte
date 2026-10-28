<script lang="ts">
  // The Progress page's level card (Progress board): the level, the XP bar and what's left to go,
  // and everything the next level unlocks, which opens the rewards track at that level.
  // New XP plays in: a claim's "+N XP" flies from its button into the bar, then the total counts
  // up and the bar fills (running past the end on a level-up). A level-up pops the number, bursts
  // confetti from it and names what the new level unlocked. Reduced motion shows the end state.
  import { Progress } from '$lib/components/ui/progress/index.js'
  import { ChevronRight, X } from '@lucide/svelte'
  import confetti from 'canvas-confetti'
  import { untrack } from 'svelte'
  import { cubicOut } from 'svelte/easing'
  import { Tween, prefersReducedMotion } from 'svelte/motion'
  import XpBadge from './XpBadge.svelte'
  import { equip } from '$lib/progress/equip'
  import { fmtXp, levelView, type LevelGain } from '$lib/progress/view'
  import { KIND_LABEL } from '$lib/progress/look'
  import { PERKS, levelOf, nextLevelPerk, perk, type Perk } from '$shared/progression.js'

  // A new `gain` object plays once, even for the same amount again
  let { xp, title, gain = null }: { xp: number; title: string | null; gain?: LevelGain | null } = $props()

  // The XP the card shows: follows `xp`, and runs from before to after while a gain plays
  const shown = new Tween(
    untrack(() => xp),
    { duration: 0 },
  )
  let playing = false
  $effect(() => {
    const now = xp
    if (!playing) void shown.set(now, { duration: 0 })
  })

  const v = $derived(levelView(Math.round(shown.current)))
  const next = $derived(nextLevelPerk(v.level))
  const nextLevel = $derived(next && 'level' in next.unlock ? next.unlock.level : null)
  // Several rewards can share a level
  const levelRewards = (level: number): Perk[] => PERKS.filter(p => 'level' in p.unlock && p.unlock.level === level)
  const nextPerks = $derived(nextLevel === null ? [] : levelRewards(nextLevel))

  let rise = $state<LevelGain | null>(null)
  let flying = $state<{ total: number; from: DOMRect } | null>(null)
  let up = $state<{ level: number; perks: Perk[] } | null>(null)
  let popping = $state(false)
  let bar = $state<HTMLElement | null>(null)
  let levelNumber: HTMLElement | undefined = $state()
  let equipped = $state(false)
  const newTitle = $derived(up?.perks.find(p => p.kind === 'title') ?? null)

  $effect(() => {
    if (gain) {
      const g = gain
      untrack(() => void play(g))
    }
  })

  const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

  async function play(g: LevelGain) {
    const reduce = prefersReducedMotion.current
    if (g.xpBefore === undefined || g.xpAfter === undefined) {
      rise = g
      return
    }
    playing = true
    up = null
    equipped = false
    await shown.set(g.xpBefore, { duration: 0 })
    if (g.from && !reduce) {
      flying = { total: g.total, from: g.from }
      await wait(650)
      flying = null
    } else if (!g.from) rise = g
    const before = levelOf(g.xpBefore).level
    const after = levelOf(g.xpAfter).level
    popping = after > before
    await shown.set(g.xpAfter, { duration: reduce ? 0 : after > before ? 1700 : 900, easing: cubicOut })
    playing = false
    if (after > before) {
      up = { level: after, perks: levelRewards(after) }
      if (!reduce) burst()
    }
  }

  // Confetti from the level number, in the app's lime and gold
  function burst() {
    const r = levelNumber?.getBoundingClientRect()
    if (!r) return
    const origin = { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight }
    const colors = ['#c6f24e', '#f2c14e', '#efeee6']
    void confetti({ particleCount: 70, spread: 75, startVelocity: 38, origin, colors, disableForReducedMotion: true })
    void confetti({ particleCount: 40, spread: 120, startVelocity: 26, decay: 0.92, origin, colors, disableForReducedMotion: true })
  }

  // The "+N XP" pill: from the Claim button to where the bar ends now
  function flyIn(node: HTMLElement, from: DOMRect) {
    const to = bar?.getBoundingClientRect()
    if (!to) return
    const dx = to.left + (to.width * v.pct) / 100 - (from.left + from.width / 2)
    const dy = to.top + to.height / 2 - (from.top + from.height / 2)
    node.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 40}px)) scale(1.1)`, opacity: 1, offset: 0.5 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.4)`, opacity: 0.2 },
      ],
      { duration: 650, easing: 'cubic-bezier(0.45, 0, 0.3, 1)', fill: 'forwards' },
    )
  }

  async function wear() {
    if (newTitle && !(await equip({ title: newTitle.id }))) equipped = true
  }
</script>

{#if flying}
  <span
    use:flyIn={flying.from}
    aria-hidden="true"
    class="pointer-events-none fixed z-50 inline-flex items-center gap-[6px] rounded-full bg-accent px-3 py-[6px] font-display font-bold text-[18px] text-accent-fg shadow-popover"
    style="left: {flying.from.left + flying.from.width / 2}px; top: {flying.from.top + flying.from.height / 2}px"
    >+{fmtXp(flying.total)}<XpBadge size={18} inverse /></span
  >
{/if}

<section
  aria-label="Level"
  class="flex flex-col gap-5 box-border rounded-[14px] border bg-surface-2 p-[18px] md:p-[22px] {up
    ? 'glow border-accent'
    : 'border-line-2'}"
>
  <div class="flex items-baseline justify-between">
    <span class="text-[12px] label-caps text-text-dim">Level</span>
    <span class="text-[13px] text-text-muted tabular-nums">{fmtXp(v.xp)} XP total</span>
  </div>
  <div class="flex flex-wrap items-end gap-5">
    {#key v.level}
      <span
        bind:this={levelNumber}
        class="font-display font-bold text-[100px] md:text-[130px] leading-[0.8] tracking-[-0.01em] {popping ? 'pop' : ''}">{v.level}</span
      >
    {/key}
    {#if title}
      <span class="pb-[6px]"
        ><span
          class="whitespace-nowrap rounded-full border border-line-chip px-4 py-2 font-display font-bold text-[15px] uppercase tracking-[0.12em]"
          >{perk(title)?.name}</span
        ></span
      >
    {/if}
  </div>
  {#if up}
    <div
      role="status"
      class="levelup flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-accent px-4 py-3"
      style="background: color-mix(in srgb, var(--color-accent) 10%, transparent)"
    >
      <span class="font-display font-bold text-[24px] leading-none uppercase tracking-[0.06em] text-accent">Level {up.level}!</span>
      {#if up.perks.length}
        <span class="min-w-0 text-[14px] text-ink-2"
          >Unlocked: {up.perks.map(p => `${p.name} (${KIND_LABEL[p.kind].one.toLowerCase()})`).join(', ')}</span
        >
      {/if}
      <span class="ml-auto flex items-center gap-2">
        {#if newTitle}
          <button
            type="button"
            disabled={equipped}
            onclick={() => void wear()}
            class="rounded-[8px] border border-line-strong bg-transparent px-[10px] py-1 text-[13px] font-semibold text-text cursor-pointer font-[inherit] disabled:cursor-default disabled:text-accent"
            >{equipped ? 'Equipped' : `Wear ${newTitle.name}`}</button
          >
        {/if}
        <a href="#/progress/rewards/{up.level}" class="text-[14px] font-semibold no-underline whitespace-nowrap">See rewards</a>
        <button
          type="button"
          aria-label="Dismiss"
          onclick={() => (up = null)}
          class="flex rounded-[6px] border-0 bg-transparent p-1 text-text-muted cursor-pointer hover:text-text"><X size={16} /></button
        >
      </span>
    </div>
  {/if}
  <div class="relative flex flex-col gap-2">
    {#if rise}
      {#key rise}
        <span
          aria-hidden="true"
          class="rise absolute -top-[30px] -translate-x-1/2 font-display font-bold text-[20px] text-accent whitespace-nowrap"
          style="left: {Math.min(92, Math.max(8, v.pct))}%">+{fmtXp(rise.total)} XP</span
        >
      {/key}
    {/if}
    <Progress
      bind:ref={bar}
      aria-label="XP to level {v.level + 1}"
      value={v.pct}
      class="h-4 rounded-full bg-surface-inset"
      fill="rounded-full bg-accent bar-stripes"
    />
    <div class="flex justify-between text-[13px] text-text-muted">
      <span>Level {v.level}</span><span class="font-semibold text-text tabular-nums">{v.toGo}</span><span>Level {v.level + 1}</span>
    </div>
  </div>
  {#if nextLevel !== null}
    <a
      href="#/progress/rewards/{nextLevel}"
      aria-label="Next unlock at level {nextLevel}: {nextPerks
        .map(p => `${KIND_LABEL[p.kind].one} ${p.name}`)
        .join(', ')}. Show it on the rewards track"
      class="flex flex-wrap items-center gap-x-[14px] gap-y-2 rounded-[10px] bg-surface-inset px-[14px] py-3 text-text no-underline hover:bg-surface-hover"
    >
      <span
        class="size-9 shrink-0 rounded-full border-2 border-dashed border-line-pip flex items-center justify-center font-display font-bold text-[16px] text-text-muted"
        >{nextLevel}</span
      >
      <span class="text-[14px] text-ink-2">{nextPerks.length > 1 ? 'Next unlocks' : 'Next unlock'}</span>
      <span class="ml-auto flex flex-wrap justify-end gap-2 min-w-0">
        {#each nextPerks as p (p.id)}
          <span class="whitespace-nowrap rounded-full border border-line-chip px-3 py-[7px]"
            ><span class="mr-[6px] text-[11px] text-text-muted">{KIND_LABEL[p.kind].one}</span><span
              class="font-display font-bold text-[13px] uppercase tracking-[0.1em]">{p.name}</span
            ></span
          >
        {/each}
      </span>
      <ChevronRight size={18} strokeWidth={2.2} class="shrink-0 text-accent" aria-hidden="true" />
    </a>
  {/if}
  <a href="#/progress/rewards" class="-mt-[6px] self-start text-[14px] font-semibold no-underline">All rewards</a>
</section>

<style>
  .rise {
    opacity: 0;
    animation: rise 3s ease-out both;
  }
  @keyframes rise {
    0% {
      transform: translate(-50%, 8px);
      opacity: 0;
    }
    15% {
      opacity: 1;
    }
    100% {
      transform: translate(-50%, -34px);
      opacity: 0;
    }
  }
  /* The new level lands */
  .pop {
    display: inline-block;
    animation: pop 0.6s cubic-bezier(0.3, 1.6, 0.5, 1) both;
  }
  @keyframes pop {
    0% {
      transform: translateY(40%) scale(0.6);
      opacity: 0;
      text-shadow: 0 0 0 rgba(198, 242, 78, 0);
    }
    60% {
      transform: scale(1.15);
      opacity: 1;
      text-shadow: 0 0 28px rgba(198, 242, 78, 0.8);
    }
    100% {
      transform: none;
      text-shadow: 0 0 0 rgba(198, 242, 78, 0);
    }
  }
  .glow {
    animation: glow 1.2s ease-out;
  }
  @keyframes glow {
    0% {
      box-shadow: 0 0 0 0 rgba(198, 242, 78, 0.6);
    }
    100% {
      box-shadow: 0 0 0 22px rgba(198, 242, 78, 0);
    }
  }
  .levelup {
    animation: levelup-in 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  @keyframes levelup-in {
    from {
      opacity: 0;
      transform: translateY(-6px) scale(0.98);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .rise {
      display: none;
    }
    .pop,
    .glow,
    .levelup {
      animation: none;
    }
  }
</style>
