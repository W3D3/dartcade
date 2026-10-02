<script lang="ts">
  // Who's signed in, and signing out: the avatar in the phone header opens it.
  import { LogOut } from '@lucide/svelte'
  import { currentUser, signOut } from '$lib/auth'
  import DevUserSwitch from './DevUserSwitch.svelte'

  const name = $derived($currentUser?.name ?? '')
  const email = $derived($currentUser?.email ?? '')
  let open = $state(false)
  const initial = $derived(name.trim().charAt(0).toUpperCase() || '?')

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false
  }

</script>

<svelte:window onkeydown={onKeydown} />

<div class="relative shrink-0">
  <button type="button" onclick={() => open = !open} aria-label="Account{name ? `: ${name}` : ''}" aria-haspopup="menu" aria-expanded={open}
    class="w-11 h-11 flex items-center justify-center bg-transparent border-0 cursor-pointer">
    <span class="w-9 h-9 rounded-full bg-accent text-accent-fg flex items-center justify-center font-bold text-[15px]">{initial}</span>
  </button>
  {#if open}
    <div class="fixed inset-0 z-40" onclick={() => open = false} aria-hidden="true"></div>
    <div role="menu" class="absolute right-0 top-full mt-2 z-50 w-[min(280px,calc(100vw-32px))] box-border p-3 rounded-[14px]
                bg-surface-2 border border-line-3 [box-shadow:0_16px_40px_rgba(0,0,0,0.5)] flex flex-col gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <span class="w-10 h-10 shrink-0 rounded-full bg-accent text-accent-fg flex items-center justify-center font-bold text-[16px]">{initial}</span>
        <span class="flex flex-col gap-[2px] min-w-0">
          <span class="text-[15px] font-semibold truncate">{name || '…'}</span>
          {#if email && email !== name}<span class="text-[13px] text-text-muted truncate">{email}</span>{/if}
        </span>
      </div>
      <button type="button" role="menuitem" onclick={() => void signOut()}
        class="h-11 flex items-center justify-center gap-2 rounded-[10px] border border-line-3 bg-transparent text-live-text text-[15px] font-medium cursor-pointer">
        <LogOut size={17} />
        Sign out
      </button>
      {#if import.meta.env.DEV}
        <DevUserSwitch label="Dev: switch to" />
      {/if}
    </div>
  {/if}
</div>
