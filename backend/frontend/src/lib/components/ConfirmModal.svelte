<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'

  let {
    title,
    body,
    confirmLabel = 'Confirm',
    cancelLabel = 'Keep playing',
    danger = false,
    onconfirm,
    oncancel,
  }: {
    title: string
    body?: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    onconfirm: () => void
    oncancel: () => void
  } = $props()
</script>

<Modal {title} subtitle={body} onclose={oncancel} showClose={false} dismissOnBackdrop={true} widthClass="max-w-[380px]" zClass="z-[200]">
  {#snippet footer()}
    <Button variant="outline" size="lg" class="flex-1 text-[15px]" onclick={oncancel}>{cancelLabel}</Button>
    <Button variant="accent" size="lg" class="flex-1 {danger ? 'bg-live text-[#fff]' : ''}" onclick={onconfirm}>{confirmLabel}</Button>
  {/snippet}
</Modal>
