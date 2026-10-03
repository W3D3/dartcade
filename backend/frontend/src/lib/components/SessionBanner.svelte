<script lang="ts">
  // "Game in progress": the server's own word on your running game (/ws/me), live.
  import { ArrowRight } from '@lucide/svelte'
  import { push } from 'svelte-spa-router'
  import { me } from '$lib/lobby/sockets'

  const game = $derived($me?.game ?? null)
  const playerNames = $derived(game?.players.join(', ') ?? '')
</script>

{#if game}
  <div class="flex items-center gap-3 min-h-11 px-4 md:h-11 md:px-6 flex-shrink-0 border-b border-[#2a3a18]
              bg-[#161d10]">
    <span class="w-[7px] h-[7px] rounded-full bg-accent shrink-0 animate-pulse"></span>
    <span class="text-[13px] text-text-muted shrink-0">Game in progress</span>
    <span class="text-[13px] font-semibold text-text uppercase shrink-0">
      {game.gameId}
    </span>
    <span class="hidden sm:inline text-[13px] text-text-muted truncate">{playerNames}</span>
    <button type="button" onclick={() => void push(`/session/${game.sessionId}`)}
      class="ml-auto flex items-center gap-[6px] text-[13px] font-semibold text-accent
             bg-transparent border-0 cursor-pointer shrink-0">
      Return to game
      <ArrowRight size={14} strokeWidth={2.5} />
    </button>
  </div>
{/if}
