<script lang="ts">
  // A button at the foot of the win screen (and the achievements screen after it): the main one is
  // lime with its icon, the others outlined.
  import { ChevronRight, House, RotateCcw } from '@lucide/svelte'
  import type { WinButton } from '$lib/winScreen'

  let { button, main = false, class: cls = '' }: { button: WinButton; main?: boolean; class?: string } = $props()
</script>

<button
  type="button"
  onclick={button.onclick}
  class="{cls} h-14 flex items-center gap-[10px] whitespace-nowrap rounded-lg cursor-pointer {main
    ? 'flex-1 md:flex-none px-4 md:px-7 justify-center border-0 bg-accent text-accent-fg font-display font-bold text-[19px] md:text-[22px] tracking-wordmark uppercase hover:brightness-[1.08]'
    : 'px-4 md:px-[22px] border border-line-strong bg-transparent text-text text-[16px] font-semibold hover:bg-surface-paused'}"
>
  {#if button.icon === 'rematch'}<RotateCcw size={20} strokeWidth={2.2} />{:else if button.icon === 'home'}<House
      size={20}
      strokeWidth={2.2}
    />{/if}{button.label}{#if button.icon === 'next'}<ChevronRight size={22} strokeWidth={2.4} />{/if}
</button>
