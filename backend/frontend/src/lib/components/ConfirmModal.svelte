<script lang="ts">
  import { Modal } from '$lib/components/ui/modal/index.js'

  let { title, body, confirmLabel = 'Confirm', danger = false, onconfirm, oncancel }: {
    title: string
    body?: string
    confirmLabel?: string
    danger?: boolean
    onconfirm: () => void
    oncancel: () => void
  } = $props()
</script>

<Modal
  {title}
  subtitle={body}
  onclose={oncancel}
  showClose={false}
  dismissOnBackdrop={true}
  widthClass="max-w-[380px]"
  zClass="z-[200]"
>
  {#snippet footer()}
    <button type="button" onclick={oncancel}
      class="flex-1 h-12 rounded-[10px] border border-line-3 bg-transparent text-text
             text-[15px] font-medium cursor-pointer">
      Keep playing
    </button>
    <button type="button" onclick={onconfirm}
      class="flex-1 h-12 rounded-[10px] border-0 text-[15px] font-bold cursor-pointer
             {danger ? 'bg-live text-[#fff]' : 'bg-accent text-accent-fg'}">
      {confirmLabel}
    </button>
  {/snippet}
</Modal>
