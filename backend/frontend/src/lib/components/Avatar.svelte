<script lang="ts">
  // A person's round avatar: their initial, a preset icon, an uploaded photo, or a robot glyph
  // for a bot (coloured by its level — calm green at Level 1 up to intense red at Level 10 —
  // instead of the name-hash colour). `avatar` (and `userId`, to build the photo's URL) is the
  // profile picture they've set, if any — omit it (or pass 'none') to always show the initial,
  // which is what every caller that hasn't been updated yet still does. Tones: the default chip
  // (name/preset colour, or the bot's level colour), `accent` for the thrower or yourself, `guest`
  // dashed, `quiet` a darker chip (bull off) — these override the identity colour the same way
  // for a bot as for a human, except `guest`: a bot has no account either (`userId: null`, same
  // as a guest), so a caller that derives `guest` from that naturally sets it for a bot seat too;
  // `bot` wins there, since the glyph and level colour are the more specific identity. Size:
  // `size` in px (the glyph scales with it), or classes in `class` for responsive sizes. A dot
  // while a member has the lobby open.
  import { Bot as BotIcon } from '@lucide/svelte'
  import { AVATAR_PRESETS } from '$shared/avatarPresets.js'
  import { avatarColor } from '$lib/avatarColor'
  import { AVATAR_PRESET_ICONS } from '$lib/avatarPresetIcons'
  import type { components } from '$lib/api/schema'
  import { botAvatarColor } from '$lib/botAvatarColor'
  import { initial } from '$lib/fmt'

  type Tone = 'default' | 'accent' | 'guest' | 'quiet'
  type AvatarValue = components['schemas']['Avatar']

  let {
    name,
    bot = null,
    tone = 'default',
    guest = false,
    presence = null,
    size,
    class: className = '',
    avatar = null,
    userId = null,
  }: {
    name: string
    /** A bot seat: shows a robot glyph coloured by level instead of the name's initial/colour. */
    bot?: { level: number } | null
    tone?: Tone
    /** Shorthand for tone="guest". */
    guest?: boolean
    presence?: 'online' | 'away' | null
    /** Width and height in px; 36 unless `class` sets the size. */
    size?: number
    class?: string
    /** Their profile picture; omit (or 'none') to always show the initial. */
    avatar?: AvatarValue | null
    /** Whose photo to fetch; required when avatar.kind is 'upload'. */
    userId?: string | null
  } = $props()

  const presetColor = (id: string): string | undefined => AVATAR_PRESETS.find(p => p.id === id)?.color

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
        : tone === 'default'
          ? avatar?.kind === 'preset'
            ? 'text-text'
            : `${avatarColor(name)} text-text`
          : TONE[tone],
  )
  // A preset's colour is a hex value (not a Tailwind class), so it's set as an inline style instead.
  const presetBg = $derived(!bot && !guest && tone === 'default' && avatar?.kind === 'preset' ? presetColor(avatar.preset) : undefined)
  const px = $derived(size ?? (className ? null : 36))
  const sizeStyle = $derived(px == null ? '' : `width: ${px}px; height: ${px}px; font-size: ${Math.round(px * 0.42)}px;`)
</script>

<span
  aria-hidden="true"
  style="{sizeStyle}{presetBg ? `background-color: ${presetBg};` : ''}"
  class="{presence
    ? 'relative'
    : ''} shrink-0 box-border rounded-full overflow-hidden flex items-center justify-center font-bold {look} {className}"
>
  {#if bot}
    <BotIcon size="62%" />
  {:else if avatar?.kind === 'upload' && userId}
    <img src="/api/users/{userId}/avatar?v={avatar.version}" alt="" class="w-full h-full object-cover" />
  {:else if avatar?.kind === 'preset' && AVATAR_PRESET_ICONS[avatar.preset]}
    {@const Icon = AVATAR_PRESET_ICONS[avatar.preset]}
    <Icon size="62%" />
  {:else}
    {initial(name)}
  {/if}
  {#if presence}
    <span
      class="absolute -right-px -bottom-px w-[10px] h-[10px] rounded-full border-2 border-surface-panel
                 {presence === 'online' ? 'bg-accent' : 'bg-text-dim'}"
    ></span>
  {/if}
</span>
