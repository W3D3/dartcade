<script lang="ts">
  // Above the phone tab bar while you're in a lobby: its name and what's next, or during its
  // game the way back. Not on the lobby page itself.
  import { ChevronRight } from '@lucide/svelte'
  import { location } from 'svelte-spa-router'
  import { me } from '$lib/lobby/sockets'
  import { indicatorView } from '$lib/lobby/format'

  const view = $derived($me?.lobby ? indicatorView($me.lobby) : null)
</script>

{#if view && $location !== '/lobby'}
  <a href={view.back ? `#/session/${view.back.sessionId}` : '#/lobby'} aria-label="You're in the lobby {view.name}. {view.line}"
    class="md:hidden shrink-0 flex items-center gap-[10px] h-12 px-4 bg-surface-active border-t border-accent-line text-text no-underline">
    <span class="w-2 h-2 rounded-full bg-accent shrink-0 animate-pulse motion-reduce:animate-none"></span>
    <span class="text-[14px] min-w-0 truncate"><span class="text-accent font-bold">{view.tag}</span> · <strong>{view.name}</strong></span>
    <span class="ml-auto text-[13px] text-text-muted shrink-0">{view.back ? view.back.label : view.next}</span>
    <ChevronRight size={16} class="text-text-muted shrink-0" />
  </a>
{/if}
