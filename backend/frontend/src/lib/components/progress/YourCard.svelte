<script lang="ts">
  // Your profile card, live, beside the pickers for its title, banner, card colours and picture
  // (your profile's Customise). An unlocked one is a tap to wear; any of them, locked ones too, can
  // be tried on the card first. Locked ones are dashed and grey, in colour on hover, with what
  // unlocks them.
  // The picture is your avatar (shared/avatarPresets.ts), worn in the colours you picked in
  // Settings; the photo reward is uploaded there too.
  import { Check, Lock, PartyPopper, Play, Trophy, Undo2, Volume2, VolumeX } from '@lucide/svelte'
  import ProfileCard from './ProfileCard.svelte'
  import Avatar from '../Avatar.svelte'
  import { currentUser } from '$lib/auth'
  import { presetIn, wearPicture } from '$lib/progress/pictures'
  import SegmentedControl from '../SegmentedControl.svelte'
  import ErrorText from '../ErrorText.svelte'
  import { profileOf, statusOf } from '$lib/progress/profiles'
  import { equip } from '$lib/progress/equip'
  import { KIND_LABEL, accentOf, bannerClass, bannerStyle, cardColors, colorsClass, nameClass } from '$lib/progress/look'
  import CardFrame from './CardFrame.svelte'
  import Celebration from './Celebration.svelte'
  import { createSoundPacks } from '$lib/soundPacks'
  import { loadSettings } from '$lib/gameSettings'
  import { PERKS, unlockText, type Equipped, type Perk, type PerkKind } from '$shared/progression.js'

  let { userId, unlocked, equipped }: { userId: string; unlocked: string[]; equipped: Equipped } = $props()

  // svelte-ignore state_referenced_locally (your own card)
  const profile = profileOf(userId)
  // svelte-ignore state_referenced_locally
  const status = statusOf(userId)
  let kind = $state<PerkKind>('title')
  let error = $state('')
  let busy = $state(false)
  // The perk tried on the card, not worn
  let trying = $state<Perk | null>(null)

  const KINDS = (['title', 'banner', 'colors', 'picture', 'frame', 'name', 'sound', 'celebration'] as const).map(k => ({
    value: k,
    label: KIND_LABEL[k].one,
  }))
  const perks = $derived(PERKS.filter(p => p.kind === kind))
  const myAvatar = $derived($currentUser?.avatar ?? null)
  const presetOf = (p: Perk) => p.id.slice('picture.'.length)
  const look = $derived<Equipped>(trying && trying.kind !== 'picture' ? { ...equipped, [trying.kind]: trying.id } : equipped)
  const avatar = $derived(trying?.kind === 'picture' ? presetIn(myAvatar, presetOf(trying)) : undefined)
  function isOn(p: Perk): boolean {
    if (p.kind !== 'picture') return equipped[p.kind] === p.id
    return myAvatar?.kind === 'preset' && myAvatar.preset === presetOf(p)
  }

  // What unlocks it: 'Level 15', '14-day streak'
  const lockLine = (p: Perk): string => unlockText(p.unlock)

  // A sound pack's sample and a celebration play on every pick (tried on or worn); the sample at
  // this device's effects volume, the celebration over the card (`run` replays it)
  const packs = createSoundPacks(() => loadSettings(typeof localStorage === 'undefined' ? null : localStorage).effectsVolume)
  let party = $state<{ id: string; run: number } | null>(null)
  function sample(p: Perk) {
    if (p.kind === 'sound') packs.preview(p.id)
    if (p.kind === 'celebration') party = { id: p.id, run: (party?.run ?? 0) + 1 }
  }
  // The level 1 pack and celebration play nothing
  const levelOne = (p: Perk) => 'level' in p.unlock && p.unlock.level === 1
  // A pack or a celebration tried on can be played again
  const replay = $derived(trying && ['sound', 'celebration'].includes(trying.kind) && !levelOne(trying) ? trying : null)

  async function pick(p: Perk) {
    if (trying?.id !== p.id) sample(p)
    // Not yours yet: try it on the card (again: back to yours)
    if (!unlocked.includes(p.id)) {
      trying = trying?.id === p.id ? null : p
      return
    }
    if (busy) return
    busy = true
    trying = null
    error = (p.kind === 'picture' ? await wearPicture(presetOf(p)) : await equip({ [p.kind]: p.id })) ?? ''
    busy = false
  }

  function statusText(p: Perk, open: boolean, on: boolean): string {
    if (on) return p.kind === 'picture' ? 'Worn' : 'Equipped'
    if (open) return 'Equip'
    return lockLine(p)
  }
</script>

<section
  aria-label="Customise your card"
  class="flex flex-col gap-[14px] box-border rounded-[14px] border border-line-2 bg-surface-2 p-[18px] md:p-[22px]"
>
  <div class="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)] items-start">
    <div class="flex flex-col gap-[14px]">
      <span class="text-[12px] label-caps text-text-dim">Your card</span>
      {#if $profile}
        <div class="relative w-fit max-w-full">
          <ProfileCard profile={$profile} {look} avatar={avatar ?? $profile.avatar} status={$status} />
          {#if party}
            {#key party.run}
              <Celebration
                id={party.id}
                colors={cardColors(look.colors)}
                class="absolute -inset-8 w-[calc(100%+4rem)] h-[calc(100%+4rem)]"
              />
            {/key}
          {/if}
        </div>
      {/if}
      {#if trying}
        <div class="flex items-center gap-2 text-[13px] text-text-muted" aria-live="polite">
          <span class="min-w-0"
            >Trying <b class="font-semibold text-text">{trying.name}</b>{#if !unlocked.includes(trying.id)}<span
                >{` · ${lockLine(trying)}`}</span
              >{/if}</span
          >
          {#if replay}
            {@const p = replay}
            <button
              type="button"
              onclick={() => sample(p)}
              class="ml-auto shrink-0 inline-flex items-center gap-1 bg-transparent border-0 p-1 text-[13px] font-semibold text-accent cursor-pointer font-[inherit]"
              ><Play size={14} />Play</button
            >
          {/if}
          <button
            type="button"
            onclick={() => (trying = null)}
            class="{replay
              ? ''
              : 'ml-auto'} shrink-0 inline-flex items-center gap-1 bg-transparent border-0 p-1 text-[13px] font-semibold text-accent cursor-pointer font-[inherit]"
            ><Undo2 size={14} />Yours</button
          >
        </div>
      {/if}
    </div>
    <div class="flex flex-col gap-3 min-w-0">
      <span class="text-[12px] label-caps text-text-dim">Customise</span>
      <SegmentedControl class="bg-surface-inset" options={KINDS} bind:value={kind} />
      {#if error}<ErrorText>{error}</ErrorText>{/if}
      <ul class="m-0 p-0 list-none grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-[10px]">
        {#each perks as p (p.id)}
          {@const open = unlocked.includes(p.id)}
          {@const on = isOn(p)}
          {@const tried = trying?.id === p.id}
          <li>
            <button
              type="button"
              disabled={busy}
              aria-pressed={tried || on}
              aria-label="{p.name}: {statusText(p, open, on)}"
              onclick={() => void pick(p)}
              class="group w-full h-full box-border flex flex-col items-start gap-2 rounded-[12px] p-3 text-left font-[inherit] text-text cursor-pointer
                     {tried
                ? 'border border-dashed border-accent bg-surface-active'
                : on
                  ? 'border border-accent bg-surface-active'
                  : open
                    ? 'border border-line-2 bg-surface-row hover:border-line-strong'
                    : 'border border-dashed border-line-dashed bg-transparent hover:border-line-strong'}"
            >
              <!-- Locked ones are grey until you look at them -->
              <span
                class="h-11 max-w-full min-w-0 flex items-center transition-[filter,opacity] duration-200 {open || tried
                  ? ''
                  : 'opacity-45 grayscale group-hover:opacity-100 group-hover:grayscale-0 group-focus-visible:opacity-100 group-focus-visible:grayscale-0'}"
              >
                {#if p.kind === 'title'}
                  <!-- One line, however long the title: the tile's name below says it in full -->
                  <span
                    class="max-w-full truncate whitespace-nowrap rounded-full border border-line-chip px-3 py-[7px] font-display font-bold text-[13px] uppercase tracking-[0.1em]"
                    >{p.name}</span
                  >
                {:else if p.kind === 'banner'}
                  <span
                    class="block w-16 h-9 rounded-[8px] border border-line-2 {bannerClass(p.id)}"
                    style={bannerStyle(p.id, cardColors(look.colors))}
                  ></span>
                {:else if p.kind === 'colors'}
                  {@const c = cardColors(p.id)}
                  <span
                    class="size-9 rounded-[8px] border border-line-2 flex items-center justify-center font-display font-bold text-[18px] {colorsClass(
                      p.id,
                    )}"
                    style="background: {c.bg}; color: {c.fg}">Aa</span
                  >
                {:else if p.kind === 'picture'}
                  <Avatar name="" avatar={presetIn(myAvatar, presetOf(p))} size={40} />
                {:else if p.kind === 'frame'}
                  <span class="relative m-[9px] flex rounded-full"
                    ><Avatar name={$profile?.name ?? ''} avatar={myAvatar} {userId} size={26} /><CardFrame frame={p.id} /></span
                  >
                {:else if p.kind === 'sound'}
                  {@const Icon = levelOne(p) ? VolumeX : Volume2}
                  <span class="size-10 rounded-full border border-line-2 bg-surface-inset flex items-center justify-center text-accent"
                    ><Icon size={20} aria-hidden="true" /></span
                  >
                {:else if p.kind === 'celebration'}
                  {@const Icon = levelOne(p) ? Trophy : PartyPopper}
                  <span class="size-10 rounded-full border border-line-2 bg-surface-inset flex items-center justify-center text-accent"
                    ><Icon size={20} aria-hidden="true" /></span
                  >
                {:else if p.kind === 'name'}
                  <span
                    class="max-w-full truncate text-[18px] font-semibold {nameClass(p.id)}"
                    style="color: {accentOf(cardColors(look.colors))}">{$profile?.name ?? 'Aa'}</span
                  >
                {/if}
              </span>
              <span class="text-[14px] font-semibold leading-tight">{p.name}</span>
              <span class="inline-flex items-center gap-1 text-[11px] {on ? 'text-accent' : 'text-text-muted'}">
                {#if on}<Check size={12} />{:else if !open}<Lock size={11} />{/if}{statusText(p, open, on)}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  </div>
</section>
