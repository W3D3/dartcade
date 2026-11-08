<script lang="ts">
  // Asks for a reason before an action that moves people (voiding a game, removing someone from the queue, moderating or reporting a course); optional unless `required`.
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { REASON_MAX } from '$lib/admin/games'

  let {
    title,
    subtitle,
    confirmLabel,
    cancelLabel = 'Cancel',
    required = false,
    placeholder = 'Kept in the audit trail',
    onconfirm,
    oncancel,
  }: {
    title: string
    subtitle: string
    confirmLabel: string
    cancelLabel?: string
    /** The confirm button waits for a reason. */
    required?: boolean
    placeholder?: string
    onconfirm: (reason: string) => void
    oncancel: () => void
  } = $props()

  let reason = $state('')
</script>

<Modal {title} {subtitle} onclose={oncancel} showClose={false} dismissOnBackdrop={true} widthClass="max-w-[440px]" zClass="z-[200]">
  <label class="flex flex-col gap-2 text-[13px] label-caps text-text-dim">
    Reason{required ? '' : ' (optional)'}
    <textarea
      bind:value={reason}
      maxlength={REASON_MAX}
      rows="3"
      {placeholder}
      class="resize-y rounded-[10px] border border-line-3 bg-transparent px-3 py-2 text-[14px] normal-case tracking-normal text-text font-[inherit]"
    ></textarea>
  </label>
  {#snippet footer()}
    <Button variant="outline" size="lg" class="flex-1 text-[15px]" onclick={oncancel}>{cancelLabel}</Button>
    <Button variant="danger" size="lg" class="flex-1" disabled={required && !reason.trim()} onclick={() => onconfirm(reason)}
      >{confirmLabel}</Button
    >
  {/snippet}
</Modal>
