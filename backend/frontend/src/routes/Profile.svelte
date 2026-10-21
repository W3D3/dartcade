<script lang="ts">
  // A player's profile (Profile-Self, Profile-Anna/Lena, Profile-Phone boards): who they are, their
  // ranked ratings and record, their X01 averages over the last month, their recent matches and the
  // modes they play most. Full stats are yours to see for yourself or a friend; anyone else sees only
  // who they are and your relationship, with an action to add them. Head-to-head is your own record
  // against them, so it shows regardless (you already know the results of games you both played).
  import { ChevronLeft, LoaderCircle, Share2 } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import StatusRing from '$lib/components/friends/StatusRing.svelte'
  import RankBadge from '$lib/components/ranked/RankBadge.svelte'
  import StatCard from '$lib/components/ranked/StatCard.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { api, type UserProfile } from '$lib/api'
  import { currentUser } from '$lib/auth'
  import { answerRequest, cancelRequest, removeFriend, sendRequest } from '$lib/friends/actions'
  import { loadPhase } from '$lib/details/page'
  import { formatWhen, historyStat, playerBadges, resultLabel, rulesLine } from '$lib/history'
  import { getGameView } from '$lib/gameViews'
  import { TIER_COLOR, record as rankedRecord, ratingCard } from '$lib/ranked/view'
  import { x01Averages } from '$lib/profile/view'

  let { params = {} }: { params?: { id?: string } } = $props()
  const targetId = $derived(params.id ?? $currentUser?.id ?? null)

  let profile = $state<UserProfile | null>(null)
  let phase = $state<'loading' | 'ready' | 'missing' | 'failed'>('loading')
  let actionBusy = $state(false)
  let actionError = $state('')
  let shared = $state(false)

  async function load(id: string) {
    phase = 'loading'
    actionError = ''
    try {
      const res = await api.GET('/api/users/{id}/profile', { params: { path: { id } } })
      if (res.data) {
        profile = res.data
        phase = 'ready'
      } else phase = loadPhase(res.response.status)
    } catch {
      phase = 'failed'
    }
  }

  $effect(() => {
    if (targetId) void load(targetId)
  })

  const since = $derived(profile ? new Date(profile.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '')
  const ratingCards = $derived(profile?.ranked ? profile.ranked.ratings.map(ratingCard) : [])
  const rec = $derived(profile?.ranked ? rankedRecord(profile.ranked.ratings) : null)
  const averages = $derived(x01Averages(profile?.stats ?? null))
  const now = new Date()

  async function withAction(run: () => Promise<string | null>) {
    if (actionBusy || !targetId) return
    actionBusy = true
    actionError = ''
    const err = await run()
    actionBusy = false
    if (err) actionError = err
    else await load(targetId)
  }

  const addFriend = () =>
    withAction(async () => {
      if (!profile) return null
      const r = await sendRequest(profile.name)
      return r.ok ? null : r.text
    })
  function answer(requestId: string | null, kind: 'accept' | 'decline') {
    return withAction(() => (requestId ? answerRequest(requestId, kind) : Promise.resolve(null)))
  }
  const accept = (requestId: string | null) => answer(requestId, 'accept')
  const decline = (requestId: string | null) => answer(requestId, 'decline')
  const cancel = (requestId: string | null) => withAction(() => (requestId ? cancelRequest(requestId) : Promise.resolve(null)))
  const unfriend = () => withAction(() => (targetId ? removeFriend(targetId) : Promise.resolve(null)))

  async function share() {
    if (!profile) return
    const url = `${location.origin}${location.pathname}#/profile/${profile.id}`
    try {
      await navigator.clipboard.writeText(url)
      shared = true
      setTimeout(() => (shared = false), 2000)
    } catch {
      /* clipboard denied: nothing to fall back to here */
    }
  }
</script>

<Layout title="Profile">
  <main class="flex min-h-0 flex-grow flex-col gap-5 overflow-y-auto box-border p-4 md:p-[30px] xl:p-10">
    {#if phase === 'loading'}
      <p class="m-0 flex items-center gap-2 py-10 text-[15px] text-text-muted">
        <LoaderCircle size={18} class="animate-spin" /> Loading profile…
      </p>
    {:else if phase === 'missing'}
      <div class="flex flex-col items-start gap-3 py-10">
        <p class="m-0 text-[17px] font-semibold">This player doesn't exist</p>
        <a href="#/" class="inline-flex items-center gap-1 font-semibold no-underline"><ChevronLeft size={16} />Back</a>
      </div>
    {:else if phase === 'failed' || !profile}
      <div class="flex flex-col items-start gap-3 py-10">
        <ErrorText>Couldn't load this profile.</ErrorText>
        <Button variant="outline" size="md" onclick={() => targetId && void load(targetId)}>Try again</Button>
      </div>
    {:else}
      <header class="flex flex-col items-start gap-4 md:flex-row md:items-center">
        <span class="relative shrink-0 m-1">
          <Avatar name={profile.name} size={96} />
          {#if profile.online !== null}<StatusRing kind={profile.online ? 'online' : 'offline'} />{/if}
        </span>
        <div class="flex min-w-0 flex-grow flex-col gap-1">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="m-0 font-display text-[34px] font-bold uppercase leading-none tracking-[0.02em] md:text-[42px]">{profile.name}</h1>
            {#if profile.isSelf}
              <span class="rounded-full border border-line-strong px-2.5 py-0.5 text-[12px] font-semibold uppercase text-text-muted"
                >You</span
              >
            {/if}
          </div>
          <span class="font-mono text-[14px] text-text-dim">@{profile.name}</span>
          <span class="text-[14px] text-text-muted">
            {#if profile.online !== null}{profile.online ? 'Online' : 'Offline'} ·{/if} Member since {since}
          </span>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          {#if profile.isSelf}
            <Button href="#/settings/profile" variant="outline" size="md">Edit in Settings</Button>
            <Button variant="ghost" size="md" onclick={() => void share()}>
              <Share2 size={16} />{shared ? 'Link copied' : 'Share profile'}
            </Button>
          {:else if profile.relation.kind === 'friend'}
            <Button variant="outline" size="md" disabled={actionBusy} onclick={() => void unfriend()}>Remove friend</Button>
          {:else if profile.relation.kind === 'incoming'}
            <Button variant="accent" size="md" disabled={actionBusy} onclick={() => void accept(profile?.relation.requestId ?? null)}
              >Accept</Button
            >
            <Button variant="ghost" size="md" disabled={actionBusy} onclick={() => void decline(profile?.relation.requestId ?? null)}
              >Decline</Button
            >
          {:else if profile.relation.kind === 'outgoing'}
            <Button variant="outline" size="md" disabled={actionBusy} onclick={() => void cancel(profile?.relation.requestId ?? null)}
              >Cancel request</Button
            >
          {:else}
            <Button variant="accent" size="md" disabled={actionBusy} onclick={() => void addFriend()}>Add friend</Button>
          {/if}
        </div>
      </header>

      {#if actionError}<ErrorText>{actionError}</ErrorText>{/if}

      {#if profile.ranked || averages || profile.headToHead}
        <div class="grid grid-cols-2 gap-[10px] md:gap-[14px] lg:grid-cols-4">
          {#each ratingCards as card (card.label)}
            <StatCard label={card.label} value={card.rating} unit={card.unit} aria="{card.label}: {card.rating} {card.unit}">
              <span class="text-[12px] font-semibold md:text-[14px]" style:color={card.rank ? TIER_COLOR[card.rank.tier] : undefined}
                >{card.title}<span class="font-normal text-text-dim {card.rank ? '' : 'hidden md:inline'}">&nbsp;{card.progress}</span
                ></span
              >
              {#snippet corner()}<RankBadge rank={card.rank} size={40} />{/snippet}
            </StatCard>
          {/each}
          {#if rec}
            <StatCard label="Record" value={rec.score} aria="Record: {rec.score}">
              <span class="text-[11px] text-text-muted md:text-[13px]">{rec.line}</span>
            </StatCard>
          {/if}
          {#if averages}
            <StatCard label="3-dart average" value={averages.average ?? '–'} aria="3-dart average: {averages.average ?? 'none yet'}">
              <span class="text-[11px] md:text-[13px] {averages.trend?.up ? 'text-accent' : 'text-text-muted'}">
                {averages.trend ? `${averages.trend.up ? '▲' : '▼'} ${averages.trend.text}` : 'Last 30 days'}
              </span>
            </StatCard>
            <StatCard label="Checkout" value={averages.checkoutPct ?? '–'} aria="Checkout rate: {averages.checkoutPct ?? 'none yet'}">
              <span class="text-[11px] text-text-muted md:text-[13px]">First 9 avg {averages.first9 ?? '–'}</span>
            </StatCard>
            <StatCard label="180s" value={averages.count180 !== null ? String(averages.count180) : '–'} aria="180s this month">
              <span class="text-[11px] text-text-muted md:text-[13px]"
                >Best leg {averages.bestLeg !== null ? `${averages.bestLeg} darts` : '–'}</span
              >
            </StatCard>
          {/if}
          {#if profile.headToHead}
            <StatCard
              label="Head-to-head"
              value="{profile.headToHead.wins}–{profile.headToHead.losses}"
              aria="Your record against {profile.name}: {profile.headToHead.wins} wins, {profile.headToHead.losses} losses"
            >
              <span class="text-[11px] text-text-muted md:text-[13px]">Your record against {profile.name}</span>
            </StatCard>
          {/if}
        </div>
      {/if}

      {#if profile.recentMatches === null}
        <p class="m-0 rounded-[14px] border border-line bg-surface-panel px-5 py-6 text-[15px] text-text-muted">
          Add {profile.name} as a friend to see their stats and match history.
        </p>
      {:else}
        <div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-label="Recent matches" class="flex flex-col overflow-hidden card">
            <h2 class="m-0 border-b border-line-2 px-5 py-3 text-[13px] label-caps text-text-dim">Recent matches</h2>
            {#if profile.recentMatches.length === 0}
              <p class="m-0 px-5 py-8 text-[15px] text-text-muted">No finished matches yet.</p>
            {:else}
              <ul class="m-0 list-none p-0">
                {#each profile.recentMatches as g (g.id)}
                  {@const when = formatWhen(g.finishedAt, now)}
                  {@const result = resultLabel(g)}
                  {@const key = historyStat(g)}
                  {@const badges = playerBadges(g)}
                  <li class="border-b border-line last:border-b-0">
                    <a
                      href="#/history/{g.id}"
                      class="flex items-center justify-between gap-3 px-5 py-3 text-text no-underline hover:bg-surface-active"
                    >
                      <span class="flex min-w-0 flex-col gap-0.5">
                        <span class="flex items-baseline gap-2">
                          <span class="font-display text-[18px] font-bold uppercase leading-none tracking-[0.02em]"
                            >{getGameView(g.mode).title}</span
                          >
                          <span class="text-[12px] text-text-dim">{when.day}</span>
                        </span>
                        <span class="truncate text-[13px] text-text-muted"
                          >{rulesLine(g)}{#if badges.length}
                            · {badges.map(b => b.name).join(', ')}{/if}</span
                        >
                      </span>
                      <span class="flex shrink-0 items-center gap-3">
                        {#if key}
                          <span class="text-right text-[13px] text-text-muted"
                            ><span class="font-display text-[18px] font-bold text-text">{key.value}</span> {key.label}</span
                          >
                        {/if}
                        <span
                          class="inline-flex h-7 items-center rounded-full px-3 text-[12px] font-bold uppercase tracking-[0.06em] {result.won
                            ? 'bg-accent text-accent-fg'
                            : 'border border-line-strong text-ink-2'}">{result.text}</span
                        >
                      </span>
                    </a>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>

          <section aria-label="Plays most" class="flex flex-col gap-3 card px-5 py-4">
            <h2 class="m-0 text-[13px] label-caps text-text-dim">Plays most</h2>
            {#if !profile.playsMost || profile.playsMost.length === 0}
              <p class="m-0 text-[14px] text-text-muted">No finished matches yet.</p>
            {:else}
              <ul class="m-0 flex list-none flex-col gap-2.5 p-0">
                {#each profile.playsMost as p (p.mode)}
                  <li class="flex flex-col gap-1">
                    <span class="flex items-center justify-between text-[14px]">
                      <span class="font-semibold">{getGameView(p.mode).title}</span>
                      <span class="text-text-muted">{p.pct}%</span>
                    </span>
                    <span class="h-1.5 overflow-hidden rounded-full bg-line-2">
                      <span class="block h-full rounded-full bg-accent" style:width="{p.pct}%"></span>
                    </span>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        </div>
      {/if}
    {/if}
  </main>
</Layout>
