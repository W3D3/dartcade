<script lang="ts">
  // The lobby's code and link (copy, or share on a phone), its QR code (in a popover anchored
  // to the button, so opening it doesn't move the page), and, for the host, a way to make a new
  // code (the old one, link and QR code stop working; people already in stay).
  import { Check, Copy, QrCode as QrIcon, RefreshCw, Share2 } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import IconButton from '$lib/components/IconButton.svelte'
  import Popover from './Popover.svelte'
  import PopoverPanel from './PopoverPanel.svelte'
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

<!-- The code stays on one line; on a narrow card the buttons wrap under it -->
<div class="flex flex-wrap items-center gap-x-[10px] md:gap-x-3 gap-y-1 min-h-[46px] md:min-h-12 box-border py-[5px] md:py-[6px] pl-3 md:pl-4 pr-[6px] md:pr-2 border border-line-chip rounded-[10px] bg-surface-panel">
  <span class="flex items-center gap-[10px] md:gap-3 whitespace-nowrap">
    <span class="text-[12px] md:text-[13px] text-text-muted">Code</span>
    <span class="font-mono text-[17px] md:text-[20px] font-medium tracking-[0.12em]">{formatCode(code)}</span>
  </span>
  <span class="flex items-center gap-[10px] md:gap-3">
  <Button variant="key" onclick={() => void share()} class="px-[10px] md:px-3 gap-[6px] text-[13px] md:text-[14px]">
    {#if copied}
      <Check size={15} />Copied
    {:else}
      <span class="md:hidden flex items-center gap-[6px]"><Share2 size={15} />Share link</span>
      <span class="hidden md:flex items-center gap-[6px]"><Copy size={15} />Copy link</span>
    {/if}
  </Button>
  <Popover triggerLabel="Show the QR code" haspopup="dialog"
    triggerClass="w-9 h-9 shrink-0 flex items-center justify-center rounded-[8px] border-0 bg-surface-key text-text">
    {#snippet trigger()}<QrIcon size={17} />{/snippet}
    {#snippet panel()}
      <PopoverPanel label="QR code to join {name}" role="dialog" align="right">
        <div class="flex flex-col items-center gap-3 p-[10px]">
          <QrCode text={link} size={240} />
          <p class="m-0 w-[240px] text-center text-[13px] leading-[1.4] text-text-muted break-all">{link}</p>
        </div>
      </PopoverPanel>
    {/snippet}
  </Popover>
  {#if host && onnewcode}
    <IconButton label="Make a new code" title="New code" onclick={() => confirmNewCode = true}><RefreshCw size={16} /></IconButton>
  {/if}
  </span>
</div>

{#if confirmNewCode}
  <ConfirmModal title="Make a new code?" body="The old code, link and QR code stop working. People already in the lobby stay."
    confirmLabel="New code" cancelLabel="Keep this one"
    onconfirm={() => { confirmNewCode = false; onnewcode?.() }} oncancel={() => confirmNewCode = false} />
{/if}
