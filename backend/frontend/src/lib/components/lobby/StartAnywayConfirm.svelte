<script lang="ts">
  // Starting a lobby game while some who play aren't ready: the host can start anyway.
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'

  let { names, onconfirm, oncancel }: { names: string[]; onconfirm: () => void; oncancel: () => void } = $props()
</script>

<ConfirmModal title="Start anyway?" body={`Not ready yet: ${names.join(', ')}.`} confirmLabel="Start anyway" cancelLabel="Wait"
  {onconfirm} {oncancel} />
