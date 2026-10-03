<script lang="ts">
  // Joining or accepting an invite while you're in another lobby (Invites-Phone): leave it first?
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'

  let { from, to, onconfirm, oncancel }: { from: string; to: string; onconfirm: () => void; oncancel: () => void } = $props()
</script>

<ConfirmModal title="Leave {from} to join {to}?"
  body="You can only be in one lobby at a time. Leaving takes you out of its next game, and your guests leave with you."
  confirmLabel="Leave and join" cancelLabel="Stay in {from}" {onconfirm} {oncancel} />
