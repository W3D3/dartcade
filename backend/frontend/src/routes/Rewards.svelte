<script lang="ts">
  // The rewards track (Rewards board): your level and where the track stands, the next unlock and
  // the next big one, every level to the top in tiers of ten (unlocked ticked, yours outlined,
  // locked ones grey until hovered or focused), and the rewards off the track; each opens its details
  // (RewardDetails), where you apply it. `#/progress/rewards/15`
  // opens it at level 15. Behind progression.enabled, like Progress.
  import { Progress } from '$lib/components/ui/progress/index.js'
  import { Check, Lock } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import PerkPreview from '$lib/components/progress/PerkPreview.svelte'
  import RewardDetails from '$lib/components/progress/RewardDetails.svelte'
  import { flag } from '$lib/flags'
  import { progress } from '$lib/progress/store'
  import { fmtXp } from '$lib/progress/view'
  import { TOP_LEVEL, TRACK, levelTier, nextBigLevel, offTrack, type OffTrack, type TrackLevel } from '$lib/progress/track'
  import { levelOf, type Perk } from '$shared/progression.js'

  let { params = {} }: { params?: { level?: string } } = $props()

  const progression = flag('progression.enabled')
  const level = $derived($progress?.level ?? 1)
  const toGo = $derived($progress ? levelOf($progress.xp).toGo : 0)
  const colors = $derived($progress?.perks.equipped.colors ?? 'colors.dartcade')
  const unlocked = $derived($progress?.perks.unlocked ?? [])
  const target = $derived(Number(params.level) || null)
  const tiers = $derived(
    Array.from({ length: Math.ceil(TOP_LEVEL / 10) }, (_, t) => {
      const levels = TRACK.slice(t * 10, t * 10 + 10)
      const got = levels.filter(l => l.level <= level).length
      return { label: `Levels ${t * 10 + 1}–${t * 10 + levels.length}`, levels, got }
    }),
  )
  const next = $derived(level < TOP_LEVEL ? TRACK[level] : null)
  const big = $derived(level < TOP_LEVEL ? TRACK[nextBigLevel(level) - 1] : null)

  // A level with more than two rewards shows three small previews (title chips are too wide) and "+N"
  const previews = (l: TrackLevel) => (l.perks.length > 2 ? l.perks.filter(p => p.kind !== 'title').slice(0, 3) : l.perks)
  const stateOf = (n: number) => (n === level ? 'unlocked, your level' : n < level ? 'unlocked' : 'locked')

  type Opened = { eyebrow: string; title: string; status: string; got: boolean; perks: readonly Perk[] }
  let opened = $state<Opened | null>(null)
  function openLevel(l: TrackLevel) {
    const got = l.level <= level
    const left = l.level - level
    opened = {
      eyebrow: `Level ${l.level}${l.level === level ? ' · your level' : ''}`,
      title: l.label,
      status: got ? 'Unlocked' : `Unlocks at level ${l.level} · ${left} ${left === 1 ? 'level' : 'levels'} to go`,
      got,
      perks: l.perks,
    }
  }
  function openOff(o: OffTrack, got: boolean) {
    opened = { eyebrow: 'Off the track', title: o.name, status: `${got ? 'Unlocked' : 'Locked'} · ${o.when}`, got, perks: o.perks }
  }

  function scrollTo(node: HTMLElement, on: boolean) {
    if (on) node.scrollIntoView({ block: 'center' })
  }
</script>

<Layout title="Rewards">
  <main
    class="flex flex-grow min-h-0 flex-col gap-4 md:gap-6 box-border min-w-0 overflow-y-auto px-4 pt-6 pb-5 md:px-[30px] md:py-7 xl:px-11 xl:py-10"
  >
    <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <a href="#/progress" class="text-[12px] label-caps text-text-dim no-underline hover:text-text">Progress</a>
        <h1 class="m-0 mt-1 font-display font-bold text-[40px] xl:text-[48px] leading-none uppercase tracking-[0.02em]">Rewards</h1>
      </div>
      <a
        href="#/profile/customise"
        class="order-last md:order-none rounded-[10px] border border-accent bg-accent px-4 py-[10px] font-display font-bold text-[16px] uppercase tracking-[0.08em] text-accent-fg no-underline hover:bg-accent-hover"
        >Customise your card</a
      >
      <div class="flex flex-wrap items-center gap-x-[18px] gap-y-1 text-[13px] text-text-muted">
        <span class="flex items-center gap-[6px]"><Check size={14} strokeWidth={3} class="text-accent" aria-hidden="true" />Unlocked</span>
        <span class="flex items-center gap-[6px]"><Lock size={14} aria-hidden="true" />Locked · hover to see it</span>
        <span class="flex items-center gap-[6px]"
          ><span class="size-3 rounded-[3px] border-[1.5px] border-[#6a7d34] bg-accent/12" aria-hidden="true"></span>Every 5th and 10th
          level: something bigger</span
        >
      </div>
    </header>

    {#if !$progression}
      <p class="m-0 text-[15px] text-text-muted">Progress isn't on for your account yet.</p>
    {:else if $progress === null}
      <PageLoading />
    {:else}
      <div class="grid gap-4 md:gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <section
          aria-label="Your level"
          class="flex items-center gap-5 box-border rounded-[14px] border border-line-2 bg-surface-2 px-[22px] py-5"
        >
          <span class="font-display font-bold text-[72px] md:text-[88px] leading-[0.8]">{level}</span>
          <div class="flex-1 min-w-0 flex flex-col gap-[10px]">
            <span class="text-[12px] label-caps text-text-dim">Level · {Math.min(level, TOP_LEVEL)} of {TOP_LEVEL} unlocked</span>
            <Progress
              aria-label="Rewards track"
              value={Math.min(level, TOP_LEVEL)}
              max={TOP_LEVEL}
              class="h-[10px] rounded-full bg-bg"
              fill="rounded-full bg-accent"
            />
            <span class="text-[13px] text-text-muted">{fmtXp(toGo)} XP to level {level + 1}</span>
          </div>
        </section>
        {#if next}
          <section
            aria-label="Next unlock"
            class="flex flex-col gap-2 box-border rounded-[14px] border border-line-2 bg-surface-2 px-[22px] py-5"
          >
            <span class="text-[12px] label-caps text-text-dim">Next · level {next.level}</span>
            <span class="font-display font-bold text-[28px] leading-[1.05] uppercase tracking-[0.03em]">{next.label}</span>
            <span class="text-[13px] text-text-muted">{next.kinds}</span>
          </section>
        {/if}
        {#if big}
          <section aria-label="Next big reward" class="tier-ten flex flex-col gap-2 box-border rounded-[14px] border px-[22px] py-5">
            <span class="text-[12px] label-caps text-accent">Next big one · level {big.level}</span>
            <span class="font-display font-bold text-[28px] leading-[1.05] uppercase tracking-[0.03em]">{big.label}</span>
            <span class="text-[13px] text-text-muted">{big.kinds}</span>
          </section>
        {/if}
      </div>

      {#each tiers as tier (tier.label)}
        <section aria-label={tier.label} class="flex flex-col gap-[10px]">
          <div class="flex items-center gap-[14px]">
            <h2 class="m-0 font-display font-bold text-[22px] uppercase tracking-[0.06em] whitespace-nowrap">{tier.label}</h2>
            <div aria-hidden="true" class="flex-1 h-1 rounded-full bg-surface-paused overflow-hidden">
              <div class="h-full bg-accent" style="width: {tier.got * 10}%"></div>
            </div>
            <span class="text-[13px] text-text-muted whitespace-nowrap">{tier.got} of {tier.levels.length}</span>
          </div>
          <!-- A list on the phone, a grid from there up -->
          <ol class="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-5 xl:grid-cols-10 gap-2">
            {#each tier.levels as l (l.level)}
              {@const shown = previews(l)}
              {@const tierCls = levelTier(l.level)}
              <li class="min-w-0">
                <button
                  type="button"
                  onclick={() => openLevel(l)}
                  use:scrollTo={l.level === target}
                  aria-label="Level {l.level}: {l.label}, {stateOf(l.level)}"
                  class="cell group relative box-border w-full min-w-0 text-left cursor-pointer flex items-center gap-3 rounded-[12px] border border-line-2 bg-surface-2 px-3 py-2
                       sm:h-[162px] sm:flex-col sm:items-stretch sm:gap-[6px] sm:px-[10px] sm:pt-[10px] sm:pb-3
                       {tierCls ? `tier-${tierCls}` : ''} {l.level === level ? 'here' : ''} {l.level > level ? 'locked' : ''} {l.level ===
                  target
                    ? 'target'
                    : ''}"
                >
                  <span class="w-12 max-sm:shrink-0 sm:w-auto flex items-center gap-1 h-[18px]">
                    <span class="font-display font-bold text-[18px] leading-none">{l.level}</span>
                    <span class="ml-auto flex">
                      {#if l.level === level}
                        <span class="rounded-full bg-accent px-[6px] py-[2px] text-[10px] font-bold tracking-[0.06em] text-accent-fg"
                          >YOU</span
                        >
                      {:else if l.level < level}
                        <Check size={14} strokeWidth={3} class="text-accent" aria-hidden="true" />
                      {:else}
                        <Lock size={13} class="text-text-dim" aria-hidden="true" />
                      {/if}
                    </span>
                  </span>
                  <span
                    class="pv w-[110px] max-sm:shrink-0 sm:w-auto h-[44px] sm:h-[62px] flex flex-wrap items-center justify-center content-center gap-[5px]
                         {shown.length > 2 ? 'dense' : shown.length === 2 ? 'pair' : ''}"
                  >
                    {#each shown as p (p.id)}<PerkPreview perk={p} {colors} />{/each}
                    {#if l.perks.length > shown.length}<span class="text-[11px] font-semibold text-text-muted"
                        >+{l.perks.length - shown.length}</span
                      >{/if}
                  </span>
                  <span class="flex-1 min-w-0 flex flex-col gap-[2px] sm:contents">
                    <span class="text-[13px] font-semibold leading-[1.25] line-clamp-2">{l.label}</span>
                    <span class="block sm:mt-auto text-[11px] uppercase tracking-[0.06em] text-text-muted truncate">{l.kinds}</span>
                  </span>
                </button>
              </li>
            {/each}
          </ol>
        </section>
      {/each}

      <section aria-label="Off the track" class="flex flex-col gap-[10px]">
        <div class="flex flex-wrap items-baseline gap-x-[14px] gap-y-1">
          <h2 class="m-0 font-display font-bold text-[22px] uppercase tracking-[0.06em]">Off the track</h2>
          <span class="text-[13px] text-text-muted">Earned with your day streak and in ranked, not by level</span>
        </div>
        <ul class="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
          {#each offTrack(unlocked) as o (o.when)}
            {@const got = o.perks.every(p => unlocked.includes(p.id))}
            <li class="min-w-0">
              <button
                type="button"
                onclick={() => openOff(o, got)}
                aria-label="{o.name}: {o.when}, {got ? 'unlocked' : 'locked'}"
                class="cell group box-border w-full h-full text-left cursor-pointer flex items-center gap-3 rounded-[12px] border border-line-2 bg-surface-2 p-3 {got
                  ? ''
                  : 'locked'}"
              >
                <span class="pv w-12 shrink-0 flex justify-center"><PerkPreview perk={o.perks[0]} {colors} short /></span>
                <span class="min-w-0 flex flex-col gap-[2px]">
                  <span class="text-[13px] font-semibold">{o.name}</span>
                  <span class="text-[12px] {got ? 'text-accent' : 'text-text-muted'}">{o.when}{got ? ' · unlocked' : ''}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </main>
</Layout>

{#if opened}<RewardDetails {...opened} onclose={() => (opened = null)} />{/if}

<style>
  .cell {
    transition:
      border-color 0.2s,
      background 0.2s;
  }
  .cell:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .pv {
    transition:
      filter 0.2s,
      opacity 0.2s;
  }
  .locked .pv {
    filter: grayscale(1);
    opacity: 0.45;
  }
  .locked:hover .pv,
  .locked:focus-visible .pv,
  .locked.target .pv {
    filter: none;
    opacity: 1;
  }
  .locked:hover {
    border-color: #4a5040;
  }
  .pv.dense {
    zoom: 0.62;
    height: 100px;
    gap: 6px;
  }
  /* Two side by side fit a tenth of the page only a little smaller */
  .pv.pair {
    zoom: 0.85;
    height: 73px;
  }
  @media (width < 40rem) {
    .pv.dense {
      zoom: 0.8;
      height: 55px;
    }
    .pv.pair {
      zoom: 1;
      height: 44px;
    }
  }
  .tier-five {
    border-color: #5a5330;
  }
  .tier-ten {
    border-color: #6a7d34;
    background: linear-gradient(180deg, rgba(198, 242, 78, 0.09), var(--color-surface-2) 70%);
  }
  .tier-top {
    border-color: #8a6a1c;
    background: linear-gradient(180deg, rgba(242, 193, 78, 0.14), var(--color-surface-2) 75%);
  }
  .target {
    outline: 2px dashed var(--color-accent);
    outline-offset: 2px;
  }
  .here {
    border-color: var(--color-accent);
    box-shadow:
      0 0 0 1px var(--color-accent),
      0 8px 28px -12px rgba(198, 242, 78, 0.6);
  }
  @media (prefers-reduced-motion: reduce) {
    .cell,
    .pv {
      transition: none;
    }
  }
</style>
