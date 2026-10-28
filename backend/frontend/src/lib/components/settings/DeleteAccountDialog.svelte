<script lang="ts">
  // The delete-account dialog both flows share (DeleteAccount, DeleteWithDiscord): the warning,
  // an optional "type your name" field, the flow's own fields, the error, Cancel and the flow's button.
  import type { Snippet } from 'svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'

  let {
    onclose,
    onsubmit,
    confirmName,
    typed = $bindable(''),
    error,
    children,
    submit,
  }: {
    onclose: () => void
    onsubmit: () => void
    /** The name to type to confirm; no field without it */
    confirmName?: string
    typed?: string
    error: string
    children?: Snippet
    /** The flow's submit button */
    submit: Snippet
  } = $props()
</script>

<Modal {onclose} showClose={false} dismissOnBackdrop={true} widthClass="max-w-[460px]">
  <form
    class="flex flex-col gap-5"
    onsubmit={e => {
      e.preventDefault()
      onsubmit()
    }}
  >
    <div class="flex flex-col gap-[10px]">
      <h2 class="m-0 font-display font-bold text-[26px] uppercase leading-[1.1] text-live-text">Delete your account?</h2>
      <p class="m-0 text-[14px] leading-[1.5] text-ink-2">This removes your profile, boards, friends, lobbies and game history.</p>
      <p class="m-0 text-[14px] leading-[1.5] text-text-dim">Your name stays in match history other players keep.</p>
    </div>
    {#if confirmName !== undefined}
      <div class="flex flex-col gap-2">
        <label for="delete-account-confirm" class="text-[14px] font-medium text-ink-soft">
          Type <strong class="text-text">{confirmName}</strong> to confirm
        </label>
        <Input id="delete-account-confirm" type="text" bind:value={typed} placeholder={confirmName} autocomplete="off" />
      </div>
    {/if}
    {@render children?.()}
    {#if error}<ErrorText>{error}</ErrorText>{/if}
    <div class="flex gap-3 justify-end">
      <Button type="button" variant="outline" onclick={onclose}>Cancel</Button>
      {@render submit()}
    </div>
  </form>
</Modal>
