<script lang="ts">
  // Asks for an optional reason before a moderator invalidates a game (list and details page).
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { INVALIDATE_WARNING, REASON_MAX } from '$lib/admin/games'

  let { onconfirm, oncancel }: { onconfirm: (reason: string) => void; oncancel: () => void } = $props()

  let reason = $state('')
</script>

<Modal
  title="Invalidate this game?"
  subtitle={INVALIDATE_WARNING}
  onclose={oncancel}
  showClose={false}
  dismissOnBackdrop={true}
  widthClass="max-w-[440px]"
  zClass="z-[200]"
>
  <label class="flex flex-col gap-2 text-[13px] label-caps text-text-dim">
    Reason (optional)
    <textarea
      bind:value={reason}
      maxlength={REASON_MAX}
      rows="3"
      placeholder="Why does this game not count?"
      class="resize-y rounded-[10px] border border-line-3 bg-transparent px-3 py-2 text-[14px] normal-case tracking-normal text-text font-[inherit]"
    ></textarea>
  </label>
  {#snippet footer()}
    <Button variant="outline" size="lg" class="flex-1 text-[15px]" onclick={oncancel}>Keep it</Button>
    <Button variant="danger" size="lg" class="flex-1" onclick={() => onconfirm(reason)}>Invalidate</Button>
  {/snippet}
</Modal>
