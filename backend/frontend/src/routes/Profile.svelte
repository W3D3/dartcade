<script lang="ts">
  // A player's profile (Profile-Self, Profile-Lena, Profile-Anna, Profile-Phone boards): the hero
  // card in their own colours and banner, ranked, averages, recent matches, level, head-to-head,
  // what they play most, and your collection on your own. `#/profile` is yours, `#/profile/:id`
  // anyone's. Your own looks the way others see it until you press Customise: then your card's
  // pickers, your XP and your collection open up. Friends see the streak and status; strangers see public games only (the API decides).
  import { ArrowLeft, Flame, LoaderCircle } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import StatusRing from '$lib/components/friends/StatusRing.svelte'
  import LevelCard from '$lib/components/progress/LevelCard.svelte'
  import YourCard from '$lib/components/progress/YourCard.svelte'
  import RankBadge from '$lib/components/ranked/RankBadge.svelte'
  import { currentUser } from '$lib/auth'
  import { flag } from '$lib/flags'
  import { profileOf, refreshProfile, statusOf } from '$lib/progress/profiles'
  import { CARD_SURFACE, accentOf, bannerStyle, cardColors, titleName } from '$lib/progress/look'
  import { progress } from '$lib/progress/store'
  import { getGameView } from '$lib/gameViews'
  import { ordinal } from '$lib/fmt'
  import { PERKS, type PerkKind } from '$shared/progression.js'
  import { rank } from '$shared/ranked.js'

  let { params = {} }: { params?: { id?: string } } = $props()

  const progression = flag('progression.enabled')
  // Your own profile shows what others see until you customise it
  let customising = $state(false)
  const userId = $derived(params.id ?? $currentUser?.id ?? null)
  // One store per player shown; read again when the page opens
  let profile = $derived(userId ? profileOf(userId) : null)
  let status = $derived(userId ? statusOf(userId) : null)
  $effect(() => {
    if (userId) refreshProfile(userId)
  })

  const STATUS_TEXT = { online: 'Online', lobby: 'In a lobby', playing: 'Playing', offline: 'Offline' } as const
  const KIND_LABEL: Record<PerkKind, string> = { title: 'Titles', banner: 'Banners', colors: 'Card colours', picture: 'Pictures' }
  const since = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const day = (iso: string) => {
    const d = new Date(iso)
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
    if (days < 1 && d.getDate() === new Date().getDate()) return 'Today'
    if (days < 2) return 'Yesterday'
    return d.toLocaleDateString('en-GB', days < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' })
  }
</script>

<Layout title="Profile">
  <main
    class="flex flex-grow min-h-0 flex-col gap-4 md:gap-6 box-border min-w-0 overflow-y-auto px-4 pt-5 pb-6 md:px-[30px] md:py-7 xl:px-11 xl:py-9"
  >
    {#if !$progression}
      <p class="m-0 text-[15px] text-text-muted">Profiles aren't on for your account yet.</p>
    {:else if !profile || !$profile}
      <div class="flex justify-center py-10 text-text-muted"><LoaderCircle class="animate-spin" size={24} aria-label="Loading" /></div>
    {:else}
      {@const p = $profile}
      {@const colors = cardColors(p.look.colors)}
      {@const self = p.relation === 'self'}
      {@const dot = status ? $status : null}
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          type="button"
          onclick={() => history.back()}
          class="inline-flex items-center gap-[6px] bg-transparent border-0 p-0 text-[14px] font-semibold text-text-muted cursor-pointer font-[inherit] hover:text-text"
          ><ArrowLeft size={16} />Back</button
        >
        {#if self}
          <span class="text-[13px] text-text-dim">This is how others see your profile. Friends also see your status and streak.</span>
        {/if}
      </div>

      <section
        aria-label="{p.name}'s card"
        class="shrink-0 overflow-hidden rounded-[16px] border border-line-popover"
        style="background: {CARD_SURFACE}"
      >
        <div class="h-[110px] md:h-[140px]" style={bannerStyle(p.look.banner, colors)}></div>
        <div class="flex flex-col gap-4 px-5 pb-5 md:px-7 md:pb-6">
          <!-- Only the avatar overlaps the banner -->
          <span class="relative -mt-12 flex size-24 shrink-0 rounded-full" style="box-shadow: 0 0 0 5px {CARD_SURFACE}">
            <Avatar name={p.name} avatar={p.avatar} userId={p.id} size={96} />
            {#if dot}<StatusRing kind={dot} />{/if}
          </span>
          <div class="flex flex-col gap-4 md:flex-row md:items-end">
            <div class="flex flex-col gap-2 min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 class="m-0 text-[30px] md:text-[36px] font-semibold leading-tight" style="color: {accentOf(colors)}">{p.name}</h1>
                <span class="text-[14px] text-text-muted">@{p.name}</span>
              </div>
              <div class="font-display font-bold text-[20px] uppercase tracking-[0.14em] text-ink-2">{titleName(p.look)}</div>
              <div class="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                <span class="rounded-full bg-surface-paused px-3 py-[6px] font-medium">Level {p.level}</span>
                {#if p.streak}
                  <span class="inline-flex items-center gap-[5px] rounded-full bg-surface-paused px-3 py-[6px] font-medium"
                    ><Flame size={14} aria-hidden="true" />{p.streak} day streak</span
                  >
                {/if}
                {#if dot}<span class="text-text-muted">{STATUS_TEXT[dot]}</span>{/if}
              </div>
              <div class="text-[13px] text-text-muted">{self ? 'You · m' : 'M'}ember since {since(p.memberSince)}</div>
            </div>
            {#if self}
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-expanded={customising}
                  aria-controls="customise"
                  onclick={() => (customising = !customising)}
                  class="rounded-[10px] px-4 py-[10px] font-display font-bold text-[16px] uppercase tracking-[0.08em] cursor-pointer {customising
                    ? 'border border-accent bg-transparent text-accent'
                    : 'border border-accent bg-accent text-accent-fg'}">{customising ? 'Done' : 'Customise'}</button
                >
                <a
                  href="#/settings/profile"
                  class="rounded-[10px] border border-line-strong px-4 py-[10px] font-display font-bold text-[16px] uppercase tracking-[0.08em] text-text no-underline"
                  >Edit in Settings</a
                >
              </div>
            {/if}
          </div>
        </div>
      </section>

      {#if self && $progress && customising}
        <div id="customise" class="scroll-mt-4">
          <YourCard mode="equip" userId={p.id} unlocked={$progress.perks.unlocked} equipped={$progress.perks.equipped} />
        </div>
      {/if}

      <div class="grid gap-4 md:gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start">
        <div class="flex flex-col gap-4 md:gap-6 min-w-0">
          <section aria-label="Ranked" class="card box-border flex flex-col gap-4 p-[18px] md:p-[22px]">
            <div class="flex items-baseline justify-between">
              <span class="text-[12px] label-caps text-text-dim">Ranked</span>
              <a href="#/matchmaking/ranks" class="text-[13px] font-semibold text-accent no-underline">Ranks</a>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              {#each p.ranked as r (r.mode)}
                <div class="flex items-center gap-3 rounded-[12px] bg-surface-inset px-4 py-3">
                  <RankBadge rank={r.rankIndex === null ? null : rank(r.rankIndex)} size={44} />
                  <div class="flex flex-col min-w-0">
                    <span class="text-[12px] text-text-muted">Rating · {r.mode}</span>
                    <span class="font-display font-bold text-[28px] leading-none">{r.rating ?? '—'}</span>
                    <span class="text-[13px] text-ink-2"
                      >{r.rankIndex === null ? (r.matches > 0 ? 'Placing' : 'Not ranked yet') : rank(r.rankIndex).name} · {r.wins}–{r.matches -
                        r.wins}</span
                    >
                  </div>
                </div>
              {/each}
            </div>
          </section>

          <section aria-label="Averages" class="card box-border grid grid-cols-2 sm:grid-cols-3 gap-4 p-[18px] md:p-[22px]">
            <div class="flex flex-col gap-1">
              <span class="text-[12px] label-caps text-text-dim">3-dart avg</span>
              <span class="font-display font-bold text-[34px] leading-none">{p.average?.toFixed(1) ?? '—'}</span>
              <span class="text-[12px] text-text-muted">X01, last 20 games</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[12px] label-caps text-text-dim">Matches</span>
              <span class="font-display font-bold text-[34px] leading-none">{p.matches}</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-[12px] label-caps text-text-dim">Favourite</span>
              <span class="font-display font-bold text-[34px] leading-none truncate"
                >{p.favourite ? getGameView(p.favourite).shortTitle : '—'}</span
              >
            </div>
          </section>

          <section aria-label="Recent matches" class="card box-border flex flex-col gap-3 p-[18px] md:p-[22px]">
            <div class="flex items-baseline justify-between">
              <span class="text-[12px] label-caps text-text-dim">Recent matches</span>
              <span class="text-[13px] text-text-muted">{p.matches} played</span>
            </div>
            {#if p.recent.length === 0}
              <p class="m-0 text-[14px] text-text-muted">{self ? 'No finished games yet.' : 'No games you can see yet.'}</p>
            {:else}
              <ul class="m-0 p-0 list-none flex flex-col">
                {#each p.recent as g (g.id)}
                  {@const won = g.placement === 1 && g.players > 1}
                  <li class="border-b border-line last:border-b-0">
                    <a
                      href="#/history/{g.id}"
                      class="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 py-3 text-text no-underline"
                    >
                      <span
                        class="size-8 rounded-full flex items-center justify-center text-[13px] font-bold {won
                          ? 'bg-accent text-accent-fg'
                          : 'bg-surface-chip text-text-muted'}"
                        title={won ? 'Won' : ordinal(g.placement)}>{won ? 'W' : g.players > 1 ? ordinal(g.placement) : '–'}</span
                      >
                      <span class="flex flex-col min-w-0">
                        <span class="truncate text-[15px] font-medium">{g.others.length ? `vs ${g.others.join(', ')}` : 'Solo'}</span>
                        <span class="truncate text-[12px] text-text-muted"
                          >{getGameView(g.gameId).title} · {g.players} {g.players === 1 ? 'player' : 'players'}</span
                        >
                      </span>
                      <span class="text-[13px] text-text-muted whitespace-nowrap">{day(g.finishedAt)}</span>
                    </a>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        </div>

        <div class="flex flex-col gap-4 md:gap-6 min-w-0">
          {#if self && $progress && customising}
            <LevelCard xp={$progress.xp} title={p.look.title} />
          {:else}
            <section aria-label="Level" class="card box-border flex items-end gap-4 p-[18px] md:p-[22px]">
              <span class="font-display font-bold text-[84px] leading-[0.8]">{p.level}</span>
              <span class="pb-1 text-[12px] label-caps text-text-dim">Level</span>
            </section>
          {/if}

          {#if p.headToHead}
            <section aria-label="Head-to-head" class="card box-border flex flex-col gap-2 p-[18px] md:p-[22px]">
              <span class="text-[12px] label-caps text-text-dim">Head-to-head</span>
              <span class="font-display font-bold text-[48px] leading-none">{p.headToHead.wins}–{p.headToHead.losses}</span>
              <span class="text-[13px] text-text-muted">Your games against {p.name}: your wins first.</span>
            </section>
          {/if}

          {#if p.playsMost.length}
            <section aria-label="Plays most" class="card box-border flex flex-col gap-3 p-[18px] md:p-[22px]">
              <span class="text-[12px] label-caps text-text-dim">Plays most</span>
              {#each p.playsMost as m (m.mode)}
                {@const pct = Math.round((m.games / Math.max(1, p.matches)) * 100)}
                <div class="grid grid-cols-[120px_minmax(0,1fr)_40px] items-center gap-3 text-[14px]">
                  <span class="truncate">{getGameView(m.mode).title}</span>
                  <span class="h-2 rounded-full bg-surface-inset overflow-hidden"
                    ><span class="block h-full bg-accent" style="width: {pct}%"></span></span
                  >
                  <span class="text-right text-text-muted tabular-nums">{pct}%</span>
                </div>
              {/each}
            </section>
          {/if}

          {#if self && $progress && customising}
            <section aria-label="Collection" class="card box-border flex flex-col gap-3 p-[18px] md:p-[22px]">
              <div class="flex items-baseline justify-between">
                <span class="text-[12px] label-caps text-text-dim">Collection</span>
                <span class="text-[13px] text-text-muted">Only you see this</span>
              </div>
              {#each ['title', 'banner', 'colors', 'picture'] as const as kind (kind)}
                {@const all = PERKS.filter(x => x.kind === kind)}
                {@const have = all.filter(x => $progress.perks.unlocked.includes(x.id)).length}
                <div class="grid grid-cols-[120px_minmax(0,1fr)_56px] items-center gap-3 text-[14px]">
                  <span>{KIND_LABEL[kind]}</span>
                  <span class="h-2 rounded-full bg-surface-inset overflow-hidden"
                    ><span class="block h-full bg-accent" style="width: {(have / all.length) * 100}%"></span></span
                  >
                  <span class="text-right text-text-muted tabular-nums">{have} of {all.length}</span>
                </div>
              {/each}
            </section>
          {/if}
        </div>
      </div>
    {/if}
  </main>
</Layout>
