<script lang="ts">
  // The overview of a profile (Profile-Self, Profile-Lena boards): ranked, averages, recent matches,
  // level, friends, head-to-head, what they play most, and your collection on your own.
  import ProfileFriends from '$lib/components/progress/ProfileFriends.svelte'
  import LevelCard from '$lib/components/progress/LevelCard.svelte'
  import RankBadge from '$lib/components/ranked/RankBadge.svelte'
  import { fmtAvg } from '$lib/playerStats'
  import type { PlayerProfile } from '$lib/progress/profiles'
  import { KIND_LABEL } from '$lib/progress/look'
  import { progress } from '$lib/progress/store'
  import { getGameView } from '$lib/gameViews'
  import { placementMark } from '$lib/progress/view'
  import { PERKS, PERK_KINDS, listed } from '$shared/progression.js'
  import { rank } from '$shared/ranked.js'
  import type { LastSeen } from '$lib/friends/view'
  import { DAY_MS } from '$shared/time'
  import { LOCALE } from '$lib/fmt'

  let { p, self, lastSeen = $bindable() }: { p: PlayerProfile; self: boolean; lastSeen?: LastSeen } = $props()

  const day = (iso: string) => {
    const d = new Date(iso)
    const days = Math.floor((Date.now() - d.getTime()) / DAY_MS)
    if (days < 1 && d.getDate() === new Date().getDate()) return 'Today'
    if (days < 2) return 'Yesterday'
    return d.toLocaleDateString(LOCALE, days < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' })
  }
</script>

<div class="grid gap-4 md:gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-start">
  <div class="flex flex-col gap-4 md:gap-6 min-w-0">
    <section aria-label="Ranked" class="card box-border flex flex-col gap-4 p-[18px] md:p-[22px]">
      <div class="flex items-baseline justify-between">
        <span class="text-[12px] label-caps text-text-dim">Ranked</span>
        <a href="#/matchmaking/ranks" class="text-[13px] font-semibold text-accent no-underline">Ranks</a>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        {#each p.ranked as r (r.mode)}
          <div class="flex items-center gap-3 rounded-lg bg-surface-inset px-4 py-3">
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
        <span class="font-display font-bold text-[34px] leading-none">{fmtAvg(p.average ?? null)}</span>
        <span class="text-[12px] text-text-muted">X01, last 30 days</span>
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
        <p class="text-[14px] text-text-muted">{self ? 'No finished games yet.' : 'No games you can see yet.'}</p>
      {:else}
        <ul class="flex flex-col">
          {#each p.recent as g (g.id)}
            {@const mark = placementMark(g.placement, g.players)}
            <li class="border-b border-line last:border-b-0">
              <a href="#/history/{g.id}" class="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 py-3 text-text no-underline">
                <span
                  class="size-8 rounded-full flex items-center justify-center text-[13px] font-bold {mark.won
                    ? 'bg-accent text-accent-fg'
                    : 'bg-surface-chip text-text-muted'}"
                  title={mark.title}>{mark.text}</span
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
    {#if self && $progress}
      <LevelCard xp={$progress.xp} title={p.look.title} />
    {:else}
      <section aria-label="Level" class="card box-border flex items-end gap-4 p-[18px] md:p-[22px]">
        <span class="font-display font-bold text-[84px] leading-[0.8]">{p.level}</span>
        <span class="pb-1 text-[12px] label-caps text-text-dim">Level</span>
      </section>
    {/if}

    <ProfileFriends userId={p.id} {self} bind:lastSeen />

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

    {#if self && $progress}
      <section aria-label="Collection" class="card box-border flex flex-col gap-3 p-[18px] md:p-[22px]">
        <div class="flex items-baseline justify-between">
          <span class="text-[12px] label-caps text-text-dim">Collection</span>
          <span class="text-[13px] text-text-muted">Only you see this</span>
        </div>
        {#each PERK_KINDS as kind (kind)}
          {@const all = PERKS.filter(x => x.kind === kind && listed(x, $progress.perks.unlocked))}
          {@const have = all.filter(x => $progress.perks.unlocked.includes(x.id)).length}
          <div class="grid grid-cols-[120px_minmax(0,1fr)_56px] items-center gap-3 text-[14px]">
            <span>{KIND_LABEL[kind].many}</span>
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
