<script lang="ts">
  // Above the phone tab bar while you're in a lobby: its name and what's next, or during its
  // game the way back. Not on the lobby page itself.
  import { ChevronRight } from '@lucide/svelte'
  import { location } from 'svelte-spa-router'
  import { me } from '$lib/lobby/sockets'
  import { indicatorView } from '$lib/lobby/format'
  import { acceptMatch } from '$lib/ranked/queue'
  import { queueView, tick } from '$lib/ranked/queueCard'
  import { currentUser } from '$lib/auth'

  const view = $derived($me?.lobby ? indicatorView($me.lobby) : null)
  const queue = $derived(queueView($me?.matchmaking ?? null, $currentUser?.id ?? null, $tick))
</script>

{#if queue}
  <!-- A search is on whatever screen you are: the strip shows it, and Accept is on it -->
  <div
    class="md:hidden shrink-0 flex items-center gap-[10px] h-12 px-4 border-t {queue.kind === 'found'
      ? 'bg-surface-picked border-accent'
      : 'bg-surface-active border-accent-line'}"
  >
    <a href="#/matchmaking" class="flex min-w-0 flex-1 items-center gap-[10px] text-text no-underline">
      {#if queue.kind === 'searching'}<span class="h-2 w-2 shrink-0 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden="true"
        ></span>{/if}
      <span class="min-w-0 truncate text-[14px] font-semibold {queue.kind === 'found' ? 'text-accent' : ''}">{queue.strip}</span>
      {#if queue.kind !== 'found'}<span class="ml-auto shrink-0 font-mono text-[13px] text-text-muted">{queue.clock}</span>{/if}
      {#if queue.kind === 'searching'}<ChevronRight size={16} class="shrink-0 text-text-muted" />{/if}
    </a>
    {#if queue.kind === 'found' && queue.matchId}
      {@const id = queue.matchId}
      <button
        type="button"
        onclick={() => void acceptMatch(id)}
        class="h-9 shrink-0 cursor-pointer rounded-[8px] border-0 bg-accent px-3 font-display text-[18px] font-bold uppercase tracking-[0.06em] text-accent-fg"
        >Accept <span class="font-mono text-[13px] font-medium tracking-normal">{queue.clock}</span></button
      >
    {/if}
  </div>
{:else if view && $location !== '/lobby'}
  <a
    href={view.back ? `#/session/${view.back.sessionId}` : '#/lobby'}
    aria-label="You're in the lobby {view.name}. {view.line}"
    class="md:hidden shrink-0 flex items-center gap-[10px] h-12 px-4 bg-surface-active border-t border-accent-line text-text no-underline"
  >
    <span class="w-2 h-2 rounded-full bg-accent shrink-0 animate-pulse motion-reduce:animate-none"></span>
    <span class="text-[14px] min-w-0 truncate"><span class="text-accent font-bold">{view.tag}</span> · <strong>{view.name}</strong></span>
    <span class="ml-auto text-[13px] text-text-muted shrink-0">{view.back ? view.back.label : view.next}</span>
    <ChevronRight size={16} class="text-text-muted shrink-0" />
  </a>
{/if}
