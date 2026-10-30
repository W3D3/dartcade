<script lang="ts">
  // A person's round avatar: their initial, a preset (the Dartcade mark in one finish on a disc in
  // another, drawn by FinishPicture), an uploaded photo, or a robot glyph
  // for a bot (coloured by its level — calm green at Level 1 up to intense red at Level 10 —
  // instead of the name-hash colour). `face` is
  // whose picture to draw (their avatar and, for an upload, the userId its URL needs): required,
  // so a call site can't forget it. Pass null, or an avatar of kind 'none', for initials only.
  // Tones: the default chip (name colour, or the bot's
  // level colour), `accent` for the thrower or yourself, `guest` dashed, `quiet` a darker chip
  // (bull off) — these restyle the fallback (initials, or a bot's glyph) the same way for a bot
  // as for a human, except `guest`: a bot has no account either (`userId: null`, same as a
  // guest), so a caller that derives `guest` from that naturally sets it for a bot seat too;
  // `bot` wins there, since the glyph and level colour are the more specific identity. A real
  // picture (a preset or an upload) always shows as chosen, whatever the tone — a chip that's
  // "you" or "quiet" still has to be recognizably your own avatar. Size: `size` in px (the glyph
  // scales with it), or classes in `class` for responsive sizes. Presence is not drawn here: callers
  // put a StatusRing around the avatar.
  import { Bot as BotIcon } from '@lucide/svelte'
  import { avatarColor } from '$lib/avatarColor'
  import FinishPicture from './FinishPicture.svelte'
  import type { Face } from '$lib/face'
  import { botAvatarColor } from '$lib/botAvatarColor'
  import { initial } from '$lib/fmt'

  type Tone = 'default' | 'accent' | 'guest' | 'quiet'

  let {
    name,
    bot = null,
    tone = 'default',
    guest = false,
    size,
    class: className = '',
    face,
  }: {
    name: string
    /** A bot seat: shows a robot glyph coloured by level instead of the name's initial/colour. */
    bot?: { level: number } | null
    tone?: Tone
    /** Shorthand for tone="guest". */
    guest?: boolean
    /** Width and height in px; 36 unless `class` sets the size. */
    size?: number
    class?: string
    /** Whose picture to draw; null (or kind 'none') shows the initial. */
    face: Face | null
  } = $props()

  // A real picture (a preset, or an uploaded photo) always shows as chosen — tone
  // only restyles the fallback chip (initials, or a bot's glyph), never hides a picture that's
  // actually set (Settings' own preview needs to show the real thing, not a forced accent green).
  const avatar = $derived(face?.avatar)
  const userId = $derived(face?.userId)
  const hasPicture = $derived(avatar?.kind === 'preset' || avatar?.kind === 'upload')

  const TONE: Record<Exclude<Tone, 'default'>, string> = {
    accent: 'bg-accent text-accent-fg',
    guest: 'border-[1.5px] border-dashed border-ink-faint text-ink-2',
    quiet: 'bg-line-3 text-text',
  }
  const look = $derived(
    bot
      ? tone === 'default'
        ? `${botAvatarColor(bot.level)} text-text`
        : TONE[tone]
      : guest
        ? TONE.guest
        : hasPicture
          ? 'text-text'
          : tone === 'default'
            ? `${avatarColor(name)} text-text`
            : TONE[tone],
  )
  const preset = $derived(!bot && !guest && avatar?.kind === 'preset' ? avatar : undefined)
  const px = $derived(size ?? (className ? null : 36))
  const sizeStyle = $derived(px == null ? '' : `width: ${px}px; height: ${px}px; font-size: ${Math.round(px * 0.42)}px;`)
</script>

<span
  aria-hidden="true"
  style={sizeStyle}
  class="shrink-0 box-border rounded-full overflow-hidden flex items-center justify-center font-bold {look} {className}"
>
  {#if bot}
    <BotIcon size="62%" />
  {:else if avatar?.kind === 'upload' && userId}
    <img src="/api/users/{userId}/avatar?v={avatar.version}" alt="" class="w-full h-full object-cover" />
  {:else if preset}
    <FinishPicture foreground={preset.foreground} background={preset.background} />
  {:else}
    {initial(name)}
  {/if}
</span>
