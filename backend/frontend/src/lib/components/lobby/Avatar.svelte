<script lang="ts">
  // A person's round avatar: their initial, dashed for a guest, with a dot while a member has the lobby open.
  let {
    name,
    guest = false,
    presence = null,
    size = 36,
  }: {
    name: string
    guest?: boolean
    presence?: 'online' | 'away' | null
    size?: number
  } = $props()
  const initial = $derived(name.trim().charAt(0).toUpperCase() || '?')
</script>

<span
  aria-hidden="true"
  style="width: {size}px; height: {size}px; font-size: {Math.round(size * 0.42)}px"
  class="relative shrink-0 box-border rounded-full flex items-center justify-center font-bold
         {guest ? 'border-[1.5px] border-dashed border-ink-faint text-ink-2' : 'bg-line-chip text-text'}"
>
  {initial}
  {#if presence}
    <span
      class="absolute -right-px -bottom-px w-[10px] h-[10px] rounded-full border-2 border-surface-panel
                 {presence === 'online' ? 'bg-accent' : 'bg-text-dim'}"
    ></span>
  {/if}
</span>
