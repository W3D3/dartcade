<script lang="ts">
  // A person's round avatar: their initial. Tones: the default chip (a colour from the name, so
  // the same person is always the same colour), `accent` for the thrower or yourself, `guest`
  // dashed, `quiet` a darker chip (bull off). Size: `size` in px (the initial scales with it), or
  // classes in `class` for responsive sizes. A dot while a member has the lobby open.
  import { avatarColor } from '$lib/avatarColor'
  import { initial } from '$lib/fmt'

  type Tone = 'default' | 'accent' | 'guest' | 'quiet'

  let {
    name,
    tone = 'default',
    guest = false,
    presence = null,
    size,
    class: className = '',
  }: {
    name: string
    tone?: Tone
    /** Shorthand for tone="guest". */
    guest?: boolean
    presence?: 'online' | 'away' | null
    /** Width and height in px; 36 unless `class` sets the size. */
    size?: number
    class?: string
  } = $props()

  const TONE: Record<Exclude<Tone, 'default'>, string> = {
    accent: 'bg-accent text-accent-fg',
    guest: 'border-[1.5px] border-dashed border-ink-faint text-ink-2',
    quiet: 'bg-line-3 text-text',
  }
  const look = $derived(guest ? TONE.guest : tone === 'default' ? `${avatarColor(name)} text-text` : TONE[tone])
  const px = $derived(size ?? (className ? null : 36))
</script>

<span
  aria-hidden="true"
  style={px == null ? undefined : `width: ${px}px; height: ${px}px; font-size: ${Math.round(px * 0.42)}px`}
  class="{presence ? 'relative' : ''} shrink-0 box-border rounded-full flex items-center justify-center font-bold {look} {className}"
>
  {initial(name)}
  {#if presence}
    <span
      class="absolute -right-px -bottom-px w-[10px] h-[10px] rounded-full border-2 border-surface-panel
                 {presence === 'online' ? 'bg-accent' : 'bg-text-dim'}"
    ></span>
  {/if}
</span>
