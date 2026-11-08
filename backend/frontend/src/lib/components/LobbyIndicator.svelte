<script lang="ts">
  // The desktop side nav's lobby card and account row, one bordered unit (Lobby-Indicator).
  // Create or Join while you're in no lobby; otherwise your lobby, live (who's in it, next game,
  // whose turn), and the way back into a running game, whether or not anyone else is in it. On
  // the Play page, whose own button creates a lobby with the chosen game, only Join shows.
  import { ChevronRight, Plus } from '@lucide/svelte'
  import { location, push } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import AccountMenu from './AccountMenu.svelte'
  import FaceStack from './FaceStack.svelte'
  import FriendsButton from './friends/FriendsButton.svelte'
  import { createLobby } from '$lib/lobby/create'
  import { me } from '$lib/lobby/sockets'
  import { indicatorView } from '$lib/lobby/format'
  import QueueCard from './ranked/QueueCard.svelte'
  import { queueView } from '$lib/ranked/queueCard'
  import { tick } from '$lib/ranked/tick'
  import { currentUser } from '$lib/auth'

  const summary = $derived($me?.lobby ?? null)
  const view = $derived(summary ? indicatorView(summary) : null)
  const queue = $derived(queueView($me?.matchmaking ?? null, $currentUser?.id ?? null, $tick))

  // The Create lobby button is left off the Play page, which has its own
  const onPlay = $derived($location === '/play')
  let error = $state('')

  async function create() {
    const created = await createLobby()
    if (created.ok) {
      error = ''
      void push('/lobby')
    } else error = created.message
  }
</script>

<!-- No overflow-hidden: the account menu opens upwards out of this box -->
<div class="flex flex-col rounded-lg border bg-surface-1 {view || queue ? 'border-accent-line' : 'border-line'}">
  {#if queue}
    <QueueCard view={queue} />
  {:else if view}
    <div class="flex flex-col gap-2 p-3 rounded-t-[11px] border-b border-line-2 bg-surface-active">
      <a
        href="#/lobby"
        aria-label="You're in the lobby {view.name}. {view.line}. Open the lobby"
        class="flex flex-col gap-2 text-text no-underline"
      >
        <span class="flex items-center justify-between">
          <span class="inline-flex items-center gap-[7px] text-[11px] font-bold label-caps text-accent">
            <span class="size-2 rounded-full bg-accent animate-pulse motion-reduce:animate-none"></span>{view.tag}
          </span>
          <ChevronRight size={16} class="text-text-muted" />
        </span>
        <span class="font-display font-bold text-[22px] leading-none uppercase tracking-title truncate">{view.name}</span>
        <span class="flex items-center gap-2 min-w-0">
          {#if summary?.faces.length}<FaceStack faces={summary.faces} />{/if}
          <span class="text-[12px] text-text-muted truncate">{view.line}</span>
        </span>
      </a>
      {#if view.back}<Button variant="accent" href="#/session/{view.back.sessionId}" class="h-[34px] text-[13px]">{view.back.label}</Button
        >{/if}
    </div>
  {:else if $me}
    <div class="flex flex-col gap-[6px] p-[10px] border-b border-line">
      {#if !onPlay}
        <Button
          variant="outline"
          size="md"
          onclick={() => void create()}
          class="bg-surface-active border-accent-line text-accent font-semibold"
        >
          <Plus size={16} strokeWidth={2.4} />Create lobby
        </Button>
      {/if}
      {#if error}<ErrorText class="text-[12px] text-center">{error}</ErrorText>{/if}
      <span class="text-[12px] text-text-dim text-center"
        >Have a code? <a href="#/join" class="font-semibold no-underline">Join a lobby</a></span
      >
    </div>
  {/if}
  <div class="flex items-center gap-2 p-[8px_10px_8px_6px]">
    <div class="grow min-w-0"><AccountMenu placement="sidebar" /></div>
    <FriendsButton />
  </div>
</div>
