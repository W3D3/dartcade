<script lang="ts">
  // A small square button with one icon (rename, QR code, new code). key: filled, as on the
  // lobby code chip; outline: a thin border, next to a heading.
  import type { Snippet } from 'svelte'

  let { label, tone = 'key', title, expanded, onclick, children }: {
    /** The accessible name: the icon has no text. */
    label: string
    tone?: 'key' | 'outline'
    title?: string
    /** For a button that shows or hides something. */
    expanded?: boolean
    onclick: () => void
    children: Snippet
  } = $props()
</script>

<button type="button" aria-label={label} {title} aria-expanded={expanded} {onclick}
  class="w-9 h-9 shrink-0 flex items-center justify-center rounded-[8px] cursor-pointer
         {tone === 'outline' ? 'bg-transparent border border-line-chip text-ink-2' : 'border-0 bg-surface-key text-text'}">
  {@render children()}
</button>
