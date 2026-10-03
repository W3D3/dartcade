<script lang="ts">
  // Leaving the lobby: your guests leave with you; the host leaving also names who takes over
  // (the server already picks them - the member who has been in the lobby longest).
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'

  let { name, guestNames, nextHostName = null, onconfirm, oncancel }: {
    name: string
    guestNames: string[]
    /** Set only when the leaving person is the host: who becomes host. */
    nextHostName?: string | null
    onconfirm: () => void
    oncancel: () => void
  } = $props()

  const hostLine = $derived(nextHostName ? `${nextHostName} becomes host.` : null)
  const guestLine = $derived(guestNames.length === 0 ? null
    : `${guestNames.join(', ')} ${guestNames.length === 1 ? 'leaves' : 'leave'} with you.`)
  const body = $derived([hostLine, guestLine].filter(Boolean).join(' ') || 'You can join again with the code.')
</script>

<ConfirmModal title="Leave {name}?" {body} confirmLabel="Leave lobby" cancelLabel="Stay" danger {onconfirm} {oncancel} />
