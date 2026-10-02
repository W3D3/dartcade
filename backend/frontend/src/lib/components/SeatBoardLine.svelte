<script lang="ts">
  // Under a player's name in a remote game: the board they throw on, or that they enter darts by hand
  // (yellow while their board is offline), and whether they have the game closed.
  import { Keyboard, Target } from '@lucide/svelte'
  import type { SeatLine } from '$lib/remote'

  let { line, size = 'md' }: { line: SeatLine; size?: 'sm' | 'md' | 'lg' } = $props()

  const text = $derived(size === 'sm' ? 'text-[12px]' : size === 'md' ? 'text-[13px]' : 'text-[15px]')
  const icon = $derived(size === 'lg' ? 15 : 13)
</script>

<span class="flex items-center gap-[5px] min-w-0 whitespace-nowrap {text} {line.offline ? 'text-warn' : 'text-text-muted'}">
  {#if line.byHand}<Keyboard size={icon} strokeWidth={1.8} class="shrink-0" />{:else}<Target size={icon} strokeWidth={1.8} class="shrink-0" />{/if}
  <span class="truncate">{line.board ?? 'Manual entry'}{#if line.board && line.byHand}<span class="text-text-dim"> · manual entry</span>{/if}{#if line.disconnected}<span class="text-text-dim"> · connection lost</span>{/if}</span>
</span>
