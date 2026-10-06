<script lang="ts">
  // The account badge and its menu (User-Badge board): who you are, your status (Online /
  // Invisible), Friends, Settings, Sign out. Phones: the avatar in the header (menu below it).
  // Tablets: the avatar at the foot of the rail (menu beside it). Desktops: a row with your name
  // and status at the foot of the side nav (menu above it).
  import { ChevronUp, LogOut, Settings, UsersRound } from '@lucide/svelte'
  import { currentUser, signOut } from '$lib/auth'
  import { me } from '$lib/lobby/sockets'
  import { friendsEntry } from '$lib/nav'
  import { STATUS_COPY, setInvisible } from '$lib/presence'
  import Avatar from './Avatar.svelte'
  import DevUserSwitch from './DevUserSwitch.svelte'
  import ErrorText from './ErrorText.svelte'
  import NavBadge from './NavBadge.svelte'
  import StatusOption from './friends/StatusOption.svelte'
  import StatusRing from './friends/StatusRing.svelte'

  let { placement = 'header' }: { placement?: 'header' | 'rail' | 'sidebar' } = $props()

  const name = $derived($currentUser?.name ?? '')
  const email = $derived($currentUser?.email ?? '')
  const invisible = $derived($currentUser?.invisible ?? false)
  const friends = $derived(friendsEntry($me?.friends ?? null))
  const requestsText = $derived(friends.requests ? `, ${friends.requests} friend ${friends.requests === 1 ? 'request' : 'requests'}` : '')
  const triggerLabel = $derived(`Account${name ? `: ${name}` : ''}, ${invisible ? 'Invisible' : 'Online'}${requestsText}`)
  let open = $state(false)
  let statusError = $state('')
  let triggerEl: HTMLButtonElement | undefined = $state()
  let menuEl: HTMLDivElement | undefined = $state()

  const MENU_POSITION = {
    header: 'absolute right-0 top-full mt-2 w-[min(296px,calc(100vw-32px))]',
    rail: 'fixed left-24 bottom-4 w-[296px]',
    sidebar: 'absolute left-0 bottom-full mb-2 w-[296px]',
  }
  const ITEM =
    'h-11 flex items-center gap-3 px-3 rounded-[10px] text-text no-underline text-[15px] font-medium hover:bg-surface-hover hover:text-text'

  async function pick(next: boolean) {
    if (next === invisible) return
    statusError = (await setInvisible(next)) ?? ''
  }

  // Closing by any route (Escape, an outside click, choosing an item) returns focus to the trigger.
  function closeMenu() {
    open = false
    triggerEl?.focus()
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) closeMenu()
  }

  // Opening moves focus into the menu, onto its first focusable control.
  $effect(() => {
    if (open) menuEl?.querySelector<HTMLElement>('[role="radio"], a, button')?.focus()
  })
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet avatar(size: number)}
  <span class="relative shrink-0 m-1">
    <Avatar {name} tone="accent" {size} />
    <StatusRing kind={invisible ? 'offline' : 'online'} />
  </span>
{/snippet}

<div class="relative {placement === 'sidebar' ? 'w-full' : 'shrink-0'}">
  {#if placement === 'sidebar'}
    <button
      bind:this={triggerEl}
      type="button"
      onclick={() => (open = !open)}
      aria-label={triggerLabel}
      aria-haspopup="menu"
      aria-expanded={open}
      class="w-full h-[60px] box-border flex items-center gap-3 px-3 rounded-[10px] border border-line bg-transparent text-left text-text cursor-pointer font-[inherit] hover:bg-surface-active"
    >
      {@render avatar(36)}
      <span class="flex flex-col gap-[2px] min-w-0 flex-grow">
        <span class="text-[14px] font-semibold truncate">{name}</span>
        <span class="text-[12px] text-text-muted">{invisible ? 'Invisible' : 'Online'}</span>
      </span>
      <ChevronUp size={16} class="text-text-muted" />
    </button>
  {:else}
    <button
      bind:this={triggerEl}
      type="button"
      onclick={() => (open = !open)}
      aria-label={triggerLabel}
      aria-haspopup="menu"
      aria-expanded={open}
      class="{placement === 'rail'
        ? 'w-14 h-14 rounded-[12px]'
        : 'w-11 h-11'} relative flex items-center justify-center bg-transparent border-0 cursor-pointer"
    >
      {@render avatar(placement === 'rail' ? 40 : 36)}
      {#if placement === 'header' && friends.requests > 0}
        <NavBadge count={friends.requests} hidden label="" class="absolute top-0 right-0 border-2 border-surface-1" />
      {/if}
    </button>
  {/if}
  {#if open}
    <div class="fixed inset-0 z-40" onclick={closeMenu} aria-hidden="true"></div>
    <div
      bind:this={menuEl}
      role="menu"
      aria-label="Account"
      class="{MENU_POSITION[placement]} z-50 box-border p-3 rounded-[14px]
                bg-surface-2 border border-line-3 shadow-popover flex flex-col gap-2"
    >
      <div class="flex items-center gap-3 min-w-0 px-1">
        {@render avatar(40)}
        <span class="flex flex-col gap-[2px] min-w-0">
          <span class="text-[15px] font-semibold truncate">{name || '…'}</span>
          <span class="font-mono text-[12px] text-text-dim truncate">{`@${name}`}{email ? ` · ${email}` : ''}</span>
        </span>
      </div>
      <span class="px-1 pt-1 text-[12px] font-semibold label-caps text-text-muted">Your status</span>
      <div role="radiogroup" aria-label="Your status" class="flex flex-col gap-1">
        <StatusOption title="Online" text={STATUS_COPY.menu.online} kind="online" checked={!invisible} onpick={() => void pick(false)} />
        <StatusOption
          title="Invisible"
          text={STATUS_COPY.menu.invisible}
          kind="offline"
          checked={invisible}
          onpick={() => void pick(true)}
        />
      </div>
      {#if statusError}<ErrorText>{statusError}</ErrorText>{/if}
      <hr class="m-0 border-0 border-t border-line-3" />
      <a href="#/friends" role="menuitem" onclick={closeMenu} class={ITEM}>
        <UsersRound size={18} strokeWidth={1.8} />
        Friends
        <span class="ml-auto text-[13px] text-text-muted">{friends.online} online</span>
        {#if friends.requests > 0}<NavBadge
            count={friends.requests}
            label="{friends.requests} friend {friends.requests === 1 ? 'request' : 'requests'}"
          />{/if}
      </a>
      <a href="#/settings" role="menuitem" onclick={closeMenu} class={ITEM}>
        <Settings size={18} strokeWidth={1.8} />
        Settings
      </a>
      <hr class="m-0 border-0 border-t border-line-3" />
      <button
        type="button"
        role="menuitem"
        onclick={() => void signOut()}
        class="h-11 flex items-center gap-3 px-3 rounded-[10px] border-0 bg-transparent text-live-text text-[15px] font-medium cursor-pointer font-[inherit] hover:bg-surface-hover"
      >
        <LogOut size={17} />
        Sign out
      </button>
      {#if import.meta.env.DEV}
        <DevUserSwitch label="Dev: switch to" />
      {/if}
    </div>
  {/if}
</div>
