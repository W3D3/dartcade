<script lang="ts">
  // One paired WLED device on Settings' Lights: its name, host/LEDs/version, segment layout, a
  // red dot plus "Not answering" once the bridge can't reach it, Blink, and a ⋯ menu (Edit opens
  // Task 13's pair/edit dialog; Remove unpairs it, confirmed inline in the popover).
  import { Lightbulb } from '@lucide/svelte'
  import { Popover } from 'bits-ui'
  import { Button } from '$lib/components/ui/button/index.js'
  import PopoverPanel from '$lib/components/lobby/PopoverPanel.svelte'
  import MenuItem from '$lib/components/lobby/MenuItem.svelte'
  import type { WledDevice } from '$lib/api'
  import { deviceSummary, since } from '$lib/lights/view'

  let {
    device,
    now,
    disabled = false,
    onblink,
    onedit,
    onremove,
  }: {
    device: WledDevice
    now: Date
    disabled?: boolean
    onblink: () => void
    onedit: () => void
    onremove: () => Promise<void>
  } = $props()

  let open = $state(false)
  let confirming = $state(false)
  let removing = $state(false)

  $effect(() => {
    if (!open) confirming = false
  })

  async function remove() {
    removing = true
    await onremove()
    removing = false
    open = false
  }
</script>

<li class="flex items-center gap-[14px] p-3 rounded-[12px] bg-surface-active border border-line-2">
  <span class="w-10 h-10 shrink-0 rounded-[10px] bg-accent-tint text-accent flex items-center justify-center">
    <Lightbulb size={20} strokeWidth={1.8} />
  </span>
  <div class="flex flex-col gap-1 min-w-0 flex-grow">
    <span class="flex items-center gap-2 text-[15px] font-semibold">
      <span
        title={device.reachable === false ? 'Not answering' : device.reachable === true ? 'Reachable' : 'Not checked yet'}
        class="w-2 h-2 rounded-full shrink-0 {device.reachable === false
          ? 'bg-live'
          : device.reachable === true
            ? 'bg-accent'
            : 'bg-text-dim'}"
      ></span>
      {device.name}
    </span>
    <span class="font-mono text-[12px] text-text-dim flex flex-col md:flex-row md:items-baseline gap-x-1.5 min-w-0">
      <span class="truncate">{device.host}</span>
      <span class="hidden md:inline" aria-hidden="true">·</span>
      <span class="truncate">{device.leds} LEDs · v{device.version}</span>
    </span>
    {#if device.reachable === false}
      <span class="text-[12px] text-live-text truncate">Not answering · {since(device.since, now)}</span>
    {:else}
      <span class="text-[12px] text-text-muted truncate">{deviceSummary(device)}</span>
    {/if}
  </div>
  <Button variant="outline" size="sm" {disabled} onclick={onblink}>Blink</Button>
  <Popover.Root bind:open>
    <Popover.Trigger
      type="button"
      aria-haspopup="menu"
      aria-label="More for {device.name}: segments, rename, remove"
      {disabled}
      class="w-8 h-9 shrink-0 flex items-center justify-center border-0 bg-transparent text-text-dim text-[18px]
             cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
    >
      ⋯
    </Popover.Trigger>
    <PopoverPanel label="More for {device.name}" width={220}>
      {#if confirming}
        <div class="flex flex-col gap-2 p-2">
          <span class="text-[13px] text-text px-1">Remove {device.name}?</span>
          <div class="flex gap-2">
            <Button variant="destructive" size="sm" class="flex-grow" disabled={removing} onclick={() => void remove()}>Remove</Button>
            <Button
              variant="outline"
              size="sm"
              class="flex-grow"
              onclick={() => {
                confirming = false
              }}>Cancel</Button
            >
          </div>
        </div>
      {:else}
        <MenuItem
          label="Edit"
          onclick={() => {
            open = false
            onedit()
          }}
        />
        <MenuItem
          label="Remove"
          danger
          onclick={() => {
            confirming = true
          }}
        />
      {/if}
    </PopoverPanel>
  </Popover.Root>
</li>
