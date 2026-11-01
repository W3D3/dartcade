<script lang="ts">
  // A reward small, as the rewards track shows it (Rewards board): a title chip, a banner strip, a
  // card colour's "Aa", the picture, a frame's ring, a sound pack, a celebration, the name style.
  // Banners are drawn in your card's colours, so it's the real thing; a picture is its finish on both layers.
  import { PartyPopper, Volume2 } from '@lucide/svelte'
  import Avatar from '../Avatar.svelte'
  import { bannerClass, bannerStyle, cardColors, colorsClass, frameOf, nameClass } from '$lib/progress/look'
  import { finishAvatar } from '$lib/progress/pictures'
  import type { Perk } from '$shared/progression.js'

  let {
    perk,
    colors,
    short = false,
  }: {
    perk: Perk
    colors: string
    /** Where there is no room for a title's name: the chip just says Title */
    short?: boolean
  } = $props()
  const ICON_BOX = 'size-8 rounded-[8px] bg-surface-paused flex items-center justify-center text-accent'
</script>

{#if perk.kind === 'title'}
  <span
    class="max-w-full truncate whitespace-nowrap rounded-full border border-line-key px-2 py-1 font-display font-bold text-[12px] uppercase tracking-[0.08em]"
    >{short ? 'Title' : perk.name}</span
  >
{:else if perk.kind === 'banner'}
  <span
    class="block w-[46px] h-[26px] rounded-[6px] border border-line-key {bannerClass(perk.id)}"
    style={bannerStyle(perk.id, cardColors(colors))}
  ></span>
{:else if perk.kind === 'colors'}
  {@const c = cardColors(perk.id)}
  <span
    class="size-[30px] rounded-[7px] border border-line-key flex items-center justify-center font-display font-bold text-[15px] {colorsClass(
      perk.id,
    )}"
    style="background: {c.bg}; color: {c.fg}">Aa</span
  >
{:else if perk.kind === 'picture'}
  <Avatar name="" face={{ avatar: finishAvatar(perk.id.slice('picture.'.length)), userId: null }} size={32} />
{:else if perk.kind === 'frame'}
  <span class="size-[34px] box-border rounded-full p-[3px] flex" style="background: {frameOf(perk.id)?.ring}"
    ><span class="flex-1 rounded-full bg-surface-2"></span></span
  >
{:else if perk.kind === 'sound'}
  <span class={ICON_BOX}><Volume2 size={18} aria-hidden="true" /></span>
{:else if perk.kind === 'celebration'}
  <span class={ICON_BOX}><PartyPopper size={18} aria-hidden="true" /></span>
{:else if perk.kind === 'name'}
  <span class="font-display font-bold text-[22px] {nameClass(perk.id)}" style="color: var(--color-gold)">Aa</span>
{/if}
