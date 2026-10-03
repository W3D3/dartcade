<script lang="ts">
  // The lobby's code and link (copy, or share on a phone), its QR code, and, for the host, a way
  // to make a new code (the old one, link and QR code stop working; people already in stay).
  import { Check, Copy, QrCode as QrIcon, RefreshCw, Share2 } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import IconButton from '$lib/components/IconButton.svelte'
  import QrCode from './QrCode.svelte'
  import { formatCode, joinLink } from '$lib/lobby/format'

  let { code, name, host = false, onnewcode }: {
    code: string
    name: string
    /** Offers "make a new code"; only the host has it. */
    host?: boolean
    onnewcode?: () => void
  } = $props()

  const link = $derived(joinLink(window.location.origin, code))

  let copied = $state(false)
  let showQr = $state(false)
  let confirmNewCode = $state(false)

  async function share() {
    // Phones hand the link to messages or mail; elsewhere (or when that's cancelled) it's copied
    if ('share' in navigator) {
      try { await navigator.share({ title: name, url: link }); return } catch { /* copy instead */ }
    }
    try {
      await navigator.clipboard.writeText(link)
      copied = true
      setTimeout(() => { copied = false }, 2000)
    } catch { /* no clipboard: the code is on screen */ }
  }
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center gap-[10px] md:gap-3 h-[46px] md:h-12 box-border pl-3 md:pl-4 pr-[6px] md:pr-2 border border-line-chip rounded-[10px] bg-surface-panel">
    <span class="text-[12px] md:text-[13px] text-text-muted">Code</span>
    <span class="font-mono text-[17px] md:text-[20px] font-medium tracking-[0.12em]">{formatCode(code)}</span>
    <Button variant="key" onclick={() => void share()} class="px-[10px] md:px-3 gap-[6px] text-[13px] md:text-[14px]">
      {#if copied}
        <Check size={15} />Copied
      {:else}
        <span class="md:hidden flex items-center gap-[6px]"><Share2 size={15} />Share link</span>
        <span class="hidden md:flex items-center gap-[6px]"><Copy size={15} />Copy link</span>
      {/if}
    </Button>
    <IconButton label="Show the QR code" expanded={showQr} onclick={() => showQr = !showQr}><QrIcon size={17} /></IconButton>
    {#if host && onnewcode}
      <IconButton label="Make a new code" title="New code" onclick={() => confirmNewCode = true}><RefreshCw size={16} /></IconButton>
    {/if}
  </div>

  {#if showQr}
    <div class="self-start flex items-center gap-4 p-4 rounded-[14px] bg-surface-panel border border-line-2">
      <QrCode text={link} />
      <p class="m-0 max-w-[200px] text-[14px] leading-[1.45] text-text-muted">
        Point a phone's camera here to join <strong class="text-text">{name}</strong>.
      </p>
    </div>
  {/if}
</div>

{#if confirmNewCode}
  <ConfirmModal title="Make a new code?" body="The old code, link and QR code stop working. People already in the lobby stay."
    confirmLabel="New code" cancelLabel="Keep this one"
    onconfirm={() => { confirmNewCode = false; onnewcode?.() }} oncancel={() => confirmNewCode = false} />
{/if}
