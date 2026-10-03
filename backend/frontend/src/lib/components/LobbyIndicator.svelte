<script lang="ts">
  // The desktop side nav's lobby card. Create or Join while you're in no lobby; your lobby,
  // live (people, next game, whose turn), and the way back into a running game once it has
  // other members; while it's solo, just a quiet link to invite someone (the server decides
  // solo, so this only ever reads the flag, never counts people itself). On the Play page,
  // whose own button creates a lobby with the chosen game, only Join shows.
  import { ChevronRight, Plus, Users } from '@lucide/svelte'
  import { location, push } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { createLobby } from '$lib/lobby/create'
  import { me } from '$lib/lobby/sockets'
  import { indicatorView } from '$lib/lobby/format'

  const summary = $derived($me?.lobby ?? null)
  const view = $derived(summary && !summary.solo ? indicatorView(summary) : null)

  const onPlay = $derived($location === '/')
  let error = $state('')

  async function create() {
    const created = await createLobby()
    if (created.ok) { error = ''; void push('/lobby') }
    else error = created.message
  }
</script>

{#if view}
  <div class="flex flex-col gap-2 p-3 rounded-[12px] border border-accent-line bg-surface-active">
    <a href="#/lobby" aria-label="You're in the lobby {view.name}. {view.line}. Open the lobby" class="flex flex-col gap-2 text-text no-underline">
      <span class="flex items-center justify-between">
        <span class="inline-flex items-center gap-[7px] text-[11px] font-bold tracking-[0.1em] uppercase text-accent">
          <span class="w-2 h-2 rounded-full bg-accent animate-pulse motion-reduce:animate-none"></span>{view.tag}
        </span>
        <ChevronRight size={16} class="text-text-muted" />
      </span>
      <span class="font-display font-bold text-[22px] leading-none uppercase tracking-[0.02em] truncate">{view.name}</span>
      <span class="text-[12px] text-text-muted truncate">{view.line}</span>
    </a>
    {#if view.back}<Button variant="accent" href="#/session/{view.back.sessionId}" class="h-[34px] text-[13px]">{view.back.label}</Button>{/if}
  </div>
{:else if summary?.solo}
  <a href="#/lobby" aria-label="Play with friends: open the lobby"
    class="flex items-center gap-2 p-3 rounded-[12px] border border-line bg-surface-1 text-text no-underline text-[13px] font-semibold">
    <Users size={16} class="text-text-muted" />Play with friends
  </a>
{:else if $me}
  <div class="flex flex-col gap-[6px] p-[10px] rounded-[12px] border border-line bg-surface-1">
    {#if !onPlay}
      <Button variant="outline" size="md" onclick={() => void create()} class="bg-surface-active border-accent-line text-accent font-semibold">
        <Plus size={16} strokeWidth={2.4} />Create lobby
      </Button>
    {/if}
    {#if error}<ErrorText class="text-[12px] text-center">{error}</ErrorText>{/if}
    <span class="text-[12px] text-text-dim text-center">Have a code? <a href="#/join" class="font-semibold no-underline">Join a lobby</a></span>
  </div>
{/if}
