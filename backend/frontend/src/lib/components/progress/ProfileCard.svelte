<script lang="ts">
  // The profile card (Profile-Popup, Player-Profile boards): the player's banner, their picture in
  // the avatar with the online-status ring (never a cosmetic), their name in the card colour's
  // accent, title, level, rank and (for friends) day streak, and three numbers. A
  // player's name previews it on hover, and your profile and the Progress page show yours as a live preview (`look`
  // and `avatar` override the stored ones).
  import { fmtAvg } from '$lib/playerStats'
  import { Flame } from '@lucide/svelte'
  import StatusRing from '../friends/StatusRing.svelte'
  import Avatar from '../Avatar.svelte'
  import type { DotKind } from '$lib/friends/view'
  import type { PlayerProfile } from '$lib/progress/profiles'
  import { CARD_SURFACE, accentOf, bannerClass, bannerStyle, cardColors, colorsClass, nameClass, titleName } from '$lib/progress/look'
  import CardFrame from './CardFrame.svelte'
  import { rank } from '$shared/ranked.js'
  import type { Equipped } from '$shared/progression.js'
  import { getGameView } from '$lib/gameViews'
  import BanNotice from '../BanNotice.svelte'

  let {
    profile,
    look = profile.look,
    avatar = profile.avatar,
    status = null,
  }: {
    profile: PlayerProfile
    look?: Equipped
    avatar?: PlayerProfile['avatar']
    status?: DotKind | null
  } = $props()

  const colors = $derived(cardColors(look.colors))
  const best = $derived(
    profile.ranked
      .filter(r => r.rankIndex !== null)
      .sort((a, b) => (b.rankIndex ?? 0) - (a.rankIndex ?? 0))
      .at(0) ?? null,
  )
  const h2h = $derived(profile.headToHead ? `${profile.headToHead.wins}–${profile.headToHead.losses}` : null)
</script>

<div
  role="dialog"
  aria-label="{profile.name}, profile"
  style="background: {CARD_SURFACE}"
  class="w-[320px] max-w-full box-border overflow-hidden rounded-[16px] border border-line-popover text-text shadow-popover {colorsClass(
    look.colors,
  )}"
>
  <div class="h-[88px] {bannerClass(look.banner)}" style={bannerStyle(look.banner, colors)}></div>
  <div class="-mt-[34px] flex flex-col px-[22px] pb-[22px]">
    <span class="relative flex size-[68px] rounded-full" style="box-shadow: 0 0 0 4px {CARD_SURFACE}">
      <Avatar name={profile.name} {avatar} userId={profile.id} size={68} />
      <CardFrame frame={look.frame} />
      {#if status}<StatusRing kind={status} />{/if}
    </span>
    <div class="mt-4 min-w-0 truncate text-[24px] font-semibold leading-[1.1] {nameClass(look.name)}" style="color: {accentOf(colors)}">
      {profile.name}
    </div>
    <div class="mt-[10px] mb-[14px] font-display font-bold text-[19px] uppercase tracking-[0.14em] text-ink-2">{titleName(look)}</div>
    <div class="flex flex-wrap gap-2 text-[13px] font-medium text-ink-2">
      <span class="rounded-full bg-surface-paused px-3 py-[6px]">Level {profile.level}</span>
      {#if best && best.rankIndex !== null}
        <span class="rounded-full bg-surface-paused px-3 py-[6px]">{rank(best.rankIndex).name} · {best.mode}</span>
      {/if}
      {#if profile.streak}
        <span class="inline-flex items-center gap-[5px] rounded-full bg-surface-paused px-3 py-[6px]"
          ><Flame size={14} aria-hidden="true" />{profile.streak} day streak</span
        >
      {/if}
    </div>
    {#if profile.ban}<BanNotice ban={profile.ban} class="mt-4" />{/if}
    <dl class="m-0 mt-4 grid grid-cols-3 gap-2 border-t border-line-2 pt-[14px]">
      <div class="flex flex-col gap-[3px]">
        <dt class="text-[11px] uppercase tracking-[0.08em] opacity-70">3-dart avg</dt>
        <dd class="m-0 font-display font-bold text-[26px] leading-none">{fmtAvg(profile.average ?? null)}</dd>
      </div>
      <div class="flex flex-col gap-[3px] min-w-0">
        <dt class="text-[11px] uppercase tracking-[0.08em] opacity-70">Favourite</dt>
        <dd class="m-0 truncate font-display font-bold text-[26px] leading-none">
          {profile.favourite ? getGameView(profile.favourite).shortTitle : '—'}
        </dd>
      </div>
      <div class="flex flex-col gap-[3px]">
        <dt class="text-[11px] uppercase tracking-[0.08em] opacity-70">{profile.relation === 'self' ? 'Matches' : 'You vs them'}</dt>
        <dd class="m-0 font-display font-bold text-[26px] leading-none">{profile.relation === 'self' ? profile.matches : (h2h ?? '—')}</dd>
      </div>
    </dl>
  </div>
</div>
