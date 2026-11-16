<script lang="ts">
  // Add device (Tournament-Onsite): a one-time code, its link and a QR code for a venue device.
  // The code works once, for 15 minutes, and is shown only here.
  import { Check, Copy } from '@lucide/svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import QrCode from '$lib/components/lobby/QrCode.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { createCopy } from '$lib/clipboard.svelte'
  import { formatPairCode, pairLink, type Pairing } from '$lib/tournaments/devices'

  let { pairing, error, onclose }: { pairing: Pairing | null; error: string | null; onclose: () => void } = $props()

  const copy = createCopy()
  const link = $derived(pairing ? pairLink(window.location.origin, pairing.code) : '')
  const until = $derived(pairing ? new Date(pairing.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')
</script>

<Modal
  title="Add a device"
  subtitle="Open the link or scan the code on the tablet. It joins this tournament for scorekeeping only."
  {onclose}
  widthClass="md:max-w-md"
>
  {#if error}
    <ErrorText>{error}</ErrorText>
  {:else if pairing}
    <div class="flex flex-col items-center gap-4">
      <QrCode text={link} size={176} label="QR code that pairs a device" />
      <p class="text-label text-text-muted">
        Or open <span class="font-semibold text-text">{window.location.host}</span> on the device and enter
      </p>
      <p class="type-page-title font-mono tracking-widest" aria-label="Pairing code">{formatPairCode(pairing.code)}</p>
      <Button variant="outline" onclick={() => copy.copy(link)}>
        {#if copy.state === 'copied'}<Check size={16} aria-hidden="true" />Link copied{:else}<Copy size={16} aria-hidden="true" />Copy link{/if}
      </Button>
      <p class="text-small text-text-muted">Works once, until {until}. The device is named when it opens.</p>
    </div>
  {/if}
  {#snippet footer()}
    <Button variant="accent" onclick={onclose}>Done</Button>
  {/snippet}
</Modal>
