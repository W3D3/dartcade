<script lang="ts">
  // A player's profile (Profile-Self, Profile-Lena, Profile-Anna, Profile-Phone boards): the hero
  // card in their own colours and banner, ranked, averages, recent matches, level, head-to-head,
  // what they play most, and your collection on your own. `#/profile` is yours, `#/profile/:id`
  // anyone's. Your own looks the way others see it, plus your XP and your collection; Customise
  // opens `#/profile/customise`. Friends see the streak and status; recent games are public ones plus those the viewer played in (the API decides).
  import { hrefs } from '$lib/routes'
  import { ArrowLeft, Eye, Flame } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import AvgBadge from '$lib/components/AvgBadge.svelte'
  import Flag from '$lib/components/Flag.svelte'
  import StatusRing from '$lib/components/friends/StatusRing.svelte'
  import ProfileOverview from '$lib/components/progress/ProfileOverview.svelte'
  import ProfileShowcase from '$lib/components/achievements/ProfileShowcase.svelte'
  import ProfileAchievements from '$lib/components/achievements/ProfileAchievements.svelte'
  import { fetchAchievements } from '$lib/achievements/store'
  import type { Achievements } from '$lib/achievements/view'
  import { currentUser } from '$lib/auth'
  import { flag } from '$lib/flags'
  import { LOCALE } from '$lib/fmt'
  import { profileOf, refreshProfile, statusOf } from '$lib/progress/profiles'
  import { CARD_SURFACE, accentOf, bannerClass, bannerStyle, cardColors, colorsClass, nameClass, titleName } from '$lib/progress/look'
  import CardFrame from '$lib/components/progress/CardFrame.svelte'
  import BanNotice from '$lib/components/BanNotice.svelte'
  import { fetchBan, type Ban } from '$lib/bans'

  import { lastSeenText, watchPath, type LastSeen } from '$lib/friends/view'
  import { me } from '$lib/lobby/sockets'

  let { params = {} }: { params?: { id?: string } } = $props()

  let lastSeen = $state<LastSeen>()
  const progression = flag('progression.enabled')
  const userId = $derived(params.id ?? $currentUser?.id ?? null)
  // One store per player shown; read again when the page opens
  let profile = $derived(userId ? profileOf(userId) : null)
  let status = $derived(userId ? statusOf(userId) : null)
  // A friend in a running game can be watched (behind watch.enabled)
  const watchOn = flag('watch.enabled')
  const watchHref = $derived.by(() => {
    const f = $me?.friends?.friends.find(x => x.id === userId)
    return f ? watchPath(f.status, $watchOn) : null
  })
  $effect(() => {
    if (userId) refreshProfile(userId)
  })

  // Without progression there's no profile to load, but a ban still shows
  let banOnly = $state<Ban | null>(null)
  $effect(() => {
    const id = userId
    banOnly = null
    if (id && !$progression) void fetchBan(id).then(b => (banOnly = id === userId ? b : banOnly))
  })

  // Achievements (behind achievements.enabled): the showcase on the overview and a tab with them all
  const achievementsOn = flag('achievements.enabled')
  let tab = $state<'overview' | 'achievements'>('overview')
  let shown = $state<Achievements | null>(null)
  $effect(() => {
    const id = userId
    shown = null
    tab = 'overview'
    if (id && $achievementsOn) void fetchAchievements(id).then(a => (shown = id === userId ? a : shown))
  })

  const STATUS_TEXT = { online: 'Online', lobby: 'In a lobby', playing: 'Playing', offline: 'Offline' } as const
  const since = (iso: string) => new Date(iso).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' })
</script>

<Layout title="Profile">
  <main
    class="flex grow min-h-0 flex-col gap-4 md:gap-6 box-border min-w-0 overflow-y-auto px-4 pt-5 pb-6 md:px-[30px] md:py-7 xl:px-11 xl:py-9"
  >
    {#if !$progression}
      {#if banOnly}<BanNotice ban={banOnly} />{/if}
      <p class="text-[15px] text-text-muted">Profiles aren't on for your account yet.</p>
    {:else if !profile || !$profile}
      <PageLoading />
    {:else}
      {@const p = $profile}
      {@const colors = cardColors(p.look.colors)}
      {@const self = p.relation === 'self'}
      {@const dot = status ? $status : null}
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          type="button"
          onclick={() => history.back()}
          class="inline-flex items-center gap-[6px] border-0 text-[14px] font-semibold text-text-muted cursor-pointer hover:text-text"
          ><ArrowLeft size={16} />Back</button
        >
        {#if self}
          <span class="text-[13px] text-text-dim"
            >This is how others see your profile. Friends also see your status and streak. Other players only see recent games they played
            with you.</span
          >
        {/if}
      </div>

      <section
        aria-label="{p.name}'s card"
        class="shrink-0 overflow-hidden rounded-popover border border-line-popover {colorsClass(p.look.colors)}"
        style="background: {CARD_SURFACE}"
      >
        <div class="h-[110px] md:h-[200px] {bannerClass(p.look.banner)}" style={bannerStyle(p.look.banner, colors)}></div>
        <div class="flex flex-col gap-4 px-5 pb-5 md:px-7 md:pb-6">
          <!-- Only the avatar overlaps the banner -->
          <span
            class="relative -mt-12 md:mt-[-68px] flex size-24 md:size-[136px] shrink-0 rounded-full"
            style="box-shadow: 0 0 0 5px {CARD_SURFACE}"
          >
            <Avatar name={p.name} face={{ avatar: p.avatar, userId: p.id }} class="size-24 md:size-[136px] text-[40px] md:text-[56px]" />
            <CardFrame frame={p.look.frame} />
            {#if dot}<StatusRing kind={dot} />{/if}
          </span>
          <div class="flex flex-col gap-4 md:flex-row md:items-end">
            <div class="flex flex-col gap-2 min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1
                  class="min-w-0 truncate font-display font-bold uppercase tracking-title text-[32px] md:text-[38px] leading-[0.95] {nameClass(
                    p.look.name,
                  )}"
                  style="color: {accentOf(colors)}"
                >
                  {p.name}
                </h1>
                <span class="text-[15px] opacity-70">@{p.name}</span>
                <Flag code={p.country} size="lg" />
                <AvgBadge average={p.average} />
              </div>
              <div class="font-display font-bold text-[20px] uppercase tracking-[0.14em] text-ink-2">{titleName(p.look)}</div>
              <div class="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
                <span class="rounded-full bg-surface-paused px-3 py-[6px] font-medium">Level {p.level}</span>
                {#if p.streak}
                  <span class="inline-flex items-center gap-[5px] rounded-full bg-surface-paused px-3 py-[6px] font-medium"
                    ><Flame size={14} aria-hidden="true" />{p.streak} day streak</span
                  >
                {/if}
                {#if dot}<span class="text-text-muted">{dot === 'offline' && lastSeen ? lastSeenText(lastSeen) : STATUS_TEXT[dot]}</span
                  >{/if}
              </div>
              <div class="text-[13px] text-text-muted">{self ? 'You · m' : 'M'}ember since {since(p.memberSince)}</div>
              {#if p.ban}<BanNotice ban={p.ban} class="self-start" />{/if}
            </div>
            {#if watchHref}
              <a
                href="#{watchHref}"
                class="inline-flex items-center gap-2 rounded-md border border-line-strong px-4 py-[10px] font-display font-bold text-[16px] uppercase tracking-cta text-text no-underline"
                ><Eye size={16} aria-hidden="true" />Watch</a
              >
            {/if}
            {#if self}
              <div class="flex flex-wrap gap-2">
                <a
                  href={hrefs.customise()}
                  class="rounded-md border border-accent bg-accent px-4 py-[10px] font-display font-bold text-[16px] uppercase tracking-cta text-accent-fg no-underline"
                  >Customise</a
                >
                <a
                  href={hrefs.settings('profile')}
                  class="rounded-md border border-line-strong px-4 py-[10px] font-display font-bold text-[16px] uppercase tracking-cta text-text no-underline"
                  >Edit in Settings</a
                >
              </div>
            {/if}
          </div>
        </div>
      </section>

      {#if shown}
        <div role="tablist" aria-label="Profile" class="flex gap-1 border-b border-line">
          {#each [['overview', 'Overview'], ['achievements', 'Achievements']] as const as [key, name] (key)}
            <button
              type="button"
              role="tab"
              aria-selected={tab === key}
              onclick={() => (tab = key)}
              class="-mb-px inline-flex cursor-pointer items-center gap-2 border-0 border-b-2 bg-transparent px-4 py-2 text-body font-semibold
                     {tab === key ? 'border-accent text-text' : 'border-transparent text-text-muted hover:text-text'}"
              >{name}{#if key === 'achievements'}<span class="rounded-full bg-surface-chip px-[7px] text-caption tabular-nums"
                  >{shown.achievements.filter(a => a.tier > 0).length}</span
                >{/if}</button
            >
          {/each}
        </div>
      {/if}

      {#if shown && tab === 'achievements'}
        <ProfileAchievements data={shown} {self} name={p.name} />
      {:else}
        {#if shown}<ProfileShowcase data={shown} {self} name={p.name} seeAll={() => (tab = 'achievements')} />{/if}
        <ProfileOverview {p} {self} bind:lastSeen />
      {/if}
    {/if}
  </main>
</Layout>
