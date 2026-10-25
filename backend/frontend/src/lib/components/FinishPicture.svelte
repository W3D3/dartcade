<script lang="ts">
  // A built-in profile picture, round: the background finish, then the foreground finish on top
  // (shared/avatarFinishes.ts; the art is FinishSprite's). Either layer can be left out to show the
  // other alone, as a picker does: the foreground then sits on a plain dark disc. Size: `size` in
  // px, or classes in `class` (it fills its box otherwise).
  let {
    foreground = null,
    background = null,
    size,
    class: className = '',
  }: {
    foreground?: string | null
    background?: string | null
    size?: number
    class?: string
  } = $props()
</script>

<span
  aria-hidden="true"
  style={size == null ? undefined : `width: ${size}px; height: ${size}px;`}
  class="relative block shrink-0 rounded-full overflow-hidden {background ? '' : 'bg-[#131511]'} {size == null && !className
    ? 'size-full'
    : ''} {className}"
>
  {#if background}
    <svg viewBox="0 0 120 120" class="absolute inset-0 size-full"><use href="#finish-bg-{background}" /></svg>
  {/if}
  {#if foreground}
    <svg viewBox="0 0 120 120" class="absolute inset-0 size-full"><use href="#finish-fg-{foreground}" /></svg>
  {/if}
</span>
