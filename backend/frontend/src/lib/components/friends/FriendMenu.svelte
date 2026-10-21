<script lang="ts">
  // The ⋯ on a friend's row: View profile, Remove friend (asks first).
  import { Ellipsis } from '@lucide/svelte'
  import { push } from 'svelte-spa-router'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import MenuItem from '$lib/components/lobby/MenuItem.svelte'
  import PopoverMenu from '$lib/components/lobby/PopoverMenu.svelte'

  let { userId, name, onremove }: { userId: string; name: string; onremove: () => void } = $props()
  let confirming = $state(false)
</script>

<PopoverMenu
  label="More for {name}"
  triggerLabel="More for {name}"
  align="right"
  width={200}
  triggerClass="w-9 h-11 md:w-10 md:h-10 flex items-center justify-center bg-transparent border-0 rounded-[8px] text-text-muted cursor-pointer hover:bg-surface-hover"
>
  {#snippet trigger()}<Ellipsis size={20} />{/snippet}
  {#snippet children(close: () => void)}
    <MenuItem
      label="View profile"
      onclick={() => {
        close()
        void push(`/profile/${userId}`)
      }}
    />
    <MenuItem
      label="Remove friend"
      danger
      onclick={() => {
        close()
        confirming = true
      }}
    />
  {/snippet}
</PopoverMenu>

{#if confirming}
  <ConfirmModal
    title="Remove {name}?"
    body="You stop seeing each other's status. Either of you can send a new request later."
    confirmLabel="Remove friend"
    cancelLabel="Keep"
    danger
    onconfirm={() => {
      confirming = false
      onremove()
    }}
    oncancel={() => (confirming = false)}
  />
{/if}
