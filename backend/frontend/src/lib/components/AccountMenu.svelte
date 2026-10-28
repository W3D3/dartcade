<script lang="ts">
  // The account badge and its menu (User-Badge board): who you are, your status (Online /
  // Invisible), Friends, your profile, Progress, Admin (admins only), Settings, Sign out; Progress,
  // Admin and Settings only on phones, where no rail or side nav lists them. Phones: the avatar
  // in the header (menu below it). Tablets: the avatar at the foot of the rail (menu beside
  // it). Desktops: a row with your name and status at the foot of the side nav (menu above it).
  // A bits-ui DropdownMenu: focus moves in on open and back to the badge on close, arrow keys and
  // typeahead move through the items, and Escape closes only the menu (the Friends drawer under
  // it is a lower layer and stays open).
  import { DropdownMenu } from 'bits-ui'
  import { ChevronUp, LogOut, Settings, ShieldCheck, TrendingUp, UserRound, UsersRound } from '@lucide/svelte'
  import { currentUser, signOut } from '$lib/auth'
  import { me } from '$lib/lobby/sockets'
  import { friendsEntry } from '$lib/nav'
  import { friendsDrawerOpen } from '$lib/friends/drawer'
  import { progressXp } from '$lib/progress/store'
  import { levelOf } from '$shared/progression.js'
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
  const level = $derived($progressXp === null ? null : levelOf($progressXp).level)
  // The rail and the side nav list Progress, Admin and Settings themselves
  const inNav = $derived(placement !== 'header')
  let statusError = $state('')
  let menuEl = $state<HTMLElement | null>(null)

  // Below the header avatar, beside the rail, above the side nav's row
  const POSITION = {
    header: { side: 'bottom', align: 'end', sideOffset: 8, width: 'w-[min(296px,calc(100vw-32px))]' },
    rail: { side: 'right', align: 'end', sideOffset: 24, width: 'w-[296px]' },
    sidebar: { side: 'top', align: 'start', sideOffset: 8, width: 'w-[296px]' },
  } as const
  const position = $derived(POSITION[placement])
  const ITEM =
    'h-11 flex items-center gap-3 px-3 rounded-[10px] text-text no-underline text-[15px] font-medium outline-none cursor-pointer data-[highlighted]:bg-surface-hover hover:text-text'

  async function pick(next: boolean) {
    if (next === invisible) return
    statusError = (await setInvisible(next)) ?? ''
  }
</script>

{#snippet avatar(size: number)}
  <span class="relative shrink-0 m-1">
    <Avatar {name} {size} avatar={$currentUser?.avatar} userId={$currentUser?.id} />
    <StatusRing kind={invisible ? 'offline' : 'online'} />
  </span>
{/snippet}

{#snippet friendsRow()}
  <UsersRound size={18} strokeWidth={1.8} />
  Friends
  <span class="ml-auto text-[13px] text-text-muted">{friends.online} online</span>
  {#if friends.requests > 0}<NavBadge
      count={friends.requests}
      label="{friends.requests} friend {friends.requests === 1 ? 'request' : 'requests'}"
    />{/if}
{/snippet}

<div class="relative {placement === 'sidebar' ? 'w-full' : 'shrink-0'}">
  <DropdownMenu.Root>
    {#if placement === 'sidebar'}
      <DropdownMenu.Trigger
        aria-label={triggerLabel}
        class="w-full box-border flex items-center gap-[10px] p-[6px] rounded-[9px] border-0 bg-transparent text-left text-text cursor-pointer font-[inherit] hover:bg-surface-active"
      >
        {@render avatar(36)}
        <span class="flex flex-col gap-[2px] min-w-0 flex-grow">
          <span class="text-[14px] font-semibold truncate">{name}</span>
          <span class="flex items-center gap-[5px] whitespace-nowrap text-[12px] text-text-muted"
            >{#if level !== null}<span class="font-medium text-accent">LV {level}</span><span aria-hidden="true">·</span>
            {/if}{invisible ? 'Invisible' : 'Online'}<ChevronUp size={12} strokeWidth={2.4} class="text-text-dim" /></span
          >
        </span>
      </DropdownMenu.Trigger>
    {:else}
      <DropdownMenu.Trigger
        aria-label={triggerLabel}
        class="{placement === 'rail'
          ? 'w-14 h-14 rounded-[12px]'
          : 'w-11 h-11'} relative flex items-center justify-center bg-transparent border-0 cursor-pointer"
      >
        {@render avatar(placement === 'rail' ? 40 : 36)}
        {#if placement === 'header' && friends.requests > 0}
          <NavBadge count={friends.requests} hidden label="" class="absolute top-0 right-0 border-2 border-surface-1" />
        {/if}
      </DropdownMenu.Trigger>
    {/if}
    <DropdownMenu.Portal>
      <!-- Above the Friends drawer (z-40/50), so the menu opens over it and the drawer stays open. -->
      <DropdownMenu.Content
        aria-label="Account"
        side={position.side}
        align={position.align}
        sideOffset={position.sideOffset}
        collisionPadding={16}
        preventScroll={false}
        bind:ref={menuEl}
        onOpenAutoFocus={e => {
          // Onto the first item (your status), not the first tabbable control (the dev switcher)
          e.preventDefault()
          menuEl?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus()
        }}
        class="{position.width} z-[70] box-border p-3 rounded-[14px] bg-surface-2 border border-line-3 shadow-popover flex flex-col gap-2 outline-none"
      >
        <div class="flex items-center gap-3 min-w-0 px-1">
          {@render avatar(40)}
          <span class="flex flex-col gap-[2px] min-w-0">
            <span class="text-[15px] font-semibold truncate">{name || '…'}</span>
            <span class="font-mono text-[12px] text-text-dim truncate">{`@${name}`}{email ? ` · ${email}` : ''}</span>
          </span>
        </div>
        <DropdownMenu.RadioGroup
          aria-label="Your status"
          value={invisible ? 'invisible' : 'online'}
          onValueChange={v => void pick(v === 'invisible')}
          class="flex flex-col gap-1"
        >
          <DropdownMenu.GroupHeading class="px-1 pt-1 text-[12px] font-semibold label-caps text-text-muted"
            >Your status</DropdownMenu.GroupHeading
          >
          <StatusOption title="Online" text={STATUS_COPY.menu.online} kind="online" value="online" />
          <StatusOption title="Invisible" text={STATUS_COPY.menu.invisible} kind="offline" value="invisible" />
        </DropdownMenu.RadioGroup>
        {#if statusError}<ErrorText>{statusError}</ErrorText>{/if}
        <DropdownMenu.Separator class="h-px bg-line-3" />
        <!-- Desktops and tablets open the Friends drawer beside the nav; phones go to the Friends page -->
        {#if placement === 'header'}
          <DropdownMenu.Item textValue="Friends">
            {#snippet child({ props })}<a {...props} href="#/friends" class={ITEM}>{@render friendsRow()}</a>{/snippet}
          </DropdownMenu.Item>
        {:else}
          <DropdownMenu.Item textValue="Friends" onSelect={() => friendsDrawerOpen.set(true)} class={ITEM}
            >{@render friendsRow()}</DropdownMenu.Item
          >
        {/if}
        {#if level !== null}
          <DropdownMenu.Item textValue="Your profile">
            {#snippet child({ props })}
              <a {...props} href="#/profile" class={ITEM}><UserRound size={18} strokeWidth={1.8} />Your profile</a>
            {/snippet}
          </DropdownMenu.Item>
          {#if !inNav}
            <DropdownMenu.Item textValue="Progress">
              {#snippet child({ props })}
                <a {...props} href="#/progress" class={ITEM}
                  ><TrendingUp size={18} strokeWidth={1.8} />Progress<span
                    class="ml-auto rounded-full bg-surface-chip px-[9px] py-[3px] text-[12px] font-semibold text-accent">LV {level}</span
                  ></a
                >
              {/snippet}
            </DropdownMenu.Item>
          {/if}
        {/if}
        {#if $currentUser?.isModerator && !inNav}
          <DropdownMenu.Item textValue="Admin">
            {#snippet child({ props })}
              <a {...props} href="#/admin" class={ITEM}><ShieldCheck size={18} strokeWidth={1.8} />Admin</a>
            {/snippet}
          </DropdownMenu.Item>
        {/if}
        {#if !inNav}
          <DropdownMenu.Item textValue="Settings">
            {#snippet child({ props })}
              <a {...props} href="#/settings" class={ITEM}><Settings size={18} strokeWidth={1.8} />Settings</a>
            {/snippet}
          </DropdownMenu.Item>
        {/if}
        <DropdownMenu.Separator class="h-px bg-line-3" />
        <DropdownMenu.Item
          onSelect={() => void signOut()}
          class="h-11 flex items-center gap-3 px-3 rounded-[10px] text-live-text text-[15px] font-medium cursor-pointer outline-none data-[highlighted]:bg-surface-hover"
        >
          <LogOut size={17} />
          Sign out
        </DropdownMenu.Item>
        {#if import.meta.env.DEV}
          <DevUserSwitch label="Dev: switch to" />
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
</div>
