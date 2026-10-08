<script lang="ts">
  // The Friends drawer (Friends-Drawer, Tablet-Friends-Drawer boards): slides out beside the side
  // nav (desktop) or the rail (tablet) over a dimmed page. Requests to answer, who's online and
  // what they play, Invite or Join, and the way to the Friends page. Closes on Escape, a click on
  // the page, the close button, or any navigation.
  import { ArrowRight, ChevronUp, UserPlus, X } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import SwitchLobbyConfirm from '$lib/components/lobby/SwitchLobbyConfirm.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import DrawerFriendRow from './DrawerFriendRow.svelte'
  import IncomingRequest from './IncomingRequest.svelte'
  import OutgoingRequest from './OutgoingRequest.svelte'
  import { me } from '$lib/lobby/sockets'
  import { createFriendActions } from '$lib/friends/controller.svelte'
  import { friendsDrawerOpen } from '$lib/friends/drawer'
  import { rowAction, splitOnline, tabCounts } from '$lib/friends/view'

  const list = $derived($me?.friends ?? { friends: [], incoming: [], outgoing: [] })
  const loaded = $derived($me?.friends != null)
  const groups = $derived(splitOnline(list.friends))
  const counts = $derived(tabCounts(list))
  const myLobbyId = $derived($me?.lobby?.id ?? null)
  const actions = createFriendActions(() => myLobbyId)
  const hasRequests = $derived(list.incoming.length > 0 || list.outgoing.length > 0)
  const requestsLabel = $derived(`Friend requests: ${list.incoming.length} new, ${list.outgoing.length} sent`)

  let now = $state(new Date())
  onMount(() => {
    const tick = setInterval(() => {
      now = new Date()
    }, 30_000)
    return () => clearInterval(tick)
  })

  const close = () => friendsDrawerOpen.set(false)

  let panel: HTMLElement | undefined = $state()
  // Focus the drawer while open, and give focus back to the Friends button when it closes
  $effect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel?.focus()
    return () => opener?.focus()
  })
  // Keep Tab inside the drawer
  function trap(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !panel) return
    const items = [...panel.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), summary')]
    const first = items[0],
      last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
  const H = 'm-0 px-[6px] pb-1 text-[12px] font-semibold label-caps text-text-muted'
</script>

<svelte:window
  onkeydown={(e: KeyboardEvent) => {
    // A confirm on top takes Escape for itself
    if (e.key === 'Escape' && !e.defaultPrevented && !actions.switching) close()
  }}
/>

<div role="presentation" class="fixed inset-y-0 left-[88px] xl:left-[248px] right-0 z-40 bg-[rgba(8,9,7,0.55)]" onclick={close}></div>

<div
  bind:this={panel}
  tabindex="-1"
  role="dialog"
  aria-modal="true"
  aria-label="Friends"
  onkeydown={trap}
  class="drawer fixed inset-y-0 left-[88px] xl:left-[248px] z-50 w-[384px] max-w-[calc(100vw-88px)] box-border flex flex-col
         bg-surface-panel border-r border-line [box-shadow:24px_0_60px_rgba(0,0,0,0.5)] outline-none"
>
  <header class="shrink-0 flex items-center gap-[10px] pt-[22px] pb-[14px] pl-5 pr-4">
    <div class="flex flex-col gap-[2px] flex-grow min-w-0">
      <h2 class="m-0 font-display font-bold text-[30px] leading-none uppercase tracking-[0.02em]">Friends</h2>
      <span class="text-[13px] text-text-muted"
        ><strong class="text-accent font-semibold">{counts.online} online</strong> · {counts.all}
        {counts.all === 1 ? 'friend' : 'friends'}</span
      >
    </div>
    <a
      href="#/friends"
      aria-label="Add a friend"
      title="Add a friend"
      class="w-10 h-10 shrink-0 flex items-center justify-center rounded-[10px] border border-line-chip text-ink-2 hover:text-text"
      ><UserPlus size={18} strokeWidth={1.8} /></a
    >
    <button
      type="button"
      aria-label="Close"
      onclick={close}
      class="w-10 h-10 shrink-0 flex items-center justify-center rounded-[10px] border-0 bg-transparent text-text-muted hover:text-text cursor-pointer"
      ><X size={20} /></button
    >
  </header>

  <div class="flex-grow min-h-0 overflow-y-auto scrollbar-themed px-3 pb-3 flex flex-col gap-4">
    {#if actions.error}<div class="px-[6px]"><ErrorText>{actions.error}</ErrorText></div>{/if}
    {#if hasRequests}
      <details open class="requests rounded-[12px] border border-line bg-surface-1">
        <summary
          aria-label={requestsLabel}
          class="flex items-center gap-[10px] h-12 px-3 rounded-[12px] cursor-pointer list-none hover:bg-surface-inset"
        >
          <span class="text-[15px] font-semibold">Requests</span>
          {#if list.incoming.length > 0}
            <span class="h-5 px-[7px] flex items-center rounded-[10px] bg-accent text-accent-fg text-[12px] font-bold"
              >{list.incoming.length} new</span
            >
          {/if}
          {#if list.outgoing.length > 0}<span class="text-[12px] text-text-dim">· {list.outgoing.length} sent</span>{/if}
          <span class="chev ml-auto flex text-text-muted"><ChevronUp size={18} /></span>
        </summary>
        <div class="flex flex-col gap-[6px] px-[10px] pb-[10px]">
          {#each list.incoming as r (r.id)}
            <IncomingRequest
              request={r}
              {now}
              busy={actions.busy}
              onaccept={() => void actions.answer(r.id, 'accept')}
              ondecline={() => void actions.answer(r.id, 'decline')}
            />
          {/each}
          {#each list.outgoing as r (r.id)}
            <OutgoingRequest request={r} {now} busy={actions.busy} oncancel={() => void actions.cancel(r.id)} />
          {/each}
        </div>
      </details>
    {/if}

    {#if loaded && list.friends.length === 0}
      <p class="m-0 px-[6px] text-[14px] leading-[1.45] text-text-muted">
        No friends yet. Add one by their name: once they accept, you see what they play and can join each other's lobbies.
      </p>
    {/if}
    {#each [{ title: 'Online', friends: groups.online }, { title: 'Offline', friends: groups.offline }] as g (g.title)}
      {#if g.friends.length > 0}
        <section aria-label="{g.title} · {g.friends.length}" class="flex flex-col gap-[2px]">
          <h3 class={H}>{g.title} · {g.friends.length}</h3>
          <ul class="m-0 p-0 list-none flex flex-col">
            {#each g.friends as f (f.id)}
              <DrawerFriendRow
                friend={f}
                action={rowAction(f, myLobbyId !== null)}
                busy={actions.busy}
                oninvite={() => void actions.invite(f)}
                onjoin={() => void actions.join(f)}
              />
            {/each}
          </ul>
        </section>
      {/if}
    {/each}
  </div>

  <footer class="shrink-0 pt-3 px-4 pb-4 border-t border-surface-paused">
    <a
      href="#/friends"
      class="h-[46px] flex items-center justify-center gap-2 rounded-[11px] border border-line-strong text-text text-[14px] font-semibold no-underline hover:text-text hover:bg-surface-active"
      >Open friends page<ArrowRight size={16} /></a
    >
  </footer>
</div>

{#if actions.switching}
  {@const s = actions.switching}
  <SwitchLobbyConfirm
    from={$me?.lobby?.name ?? 'your lobby'}
    to={s.lobbyName}
    onconfirm={() => void actions.leaveAndJoin()}
    oncancel={actions.stopSwitch}
  />
{/if}

<style>
  .requests summary::-webkit-details-marker {
    display: none;
  }
  .chev {
    transition: transform 0.15s;
  }
  .requests:not([open]) .chev {
    transform: rotate(180deg);
  }
  @keyframes drawer-in {
    from {
      transform: translateX(-24px);
      opacity: 0;
    }
    to {
      transform: none;
      opacity: 1;
    }
  }
  .drawer {
    animation: drawer-in 0.22s cubic-bezier(0.2, 0.8, 0.3, 1) both;
  }
  @media (prefers-reduced-motion: reduce) {
    .drawer {
      animation: none;
    }
    .chev {
      transition: none;
    }
  }
</style>
