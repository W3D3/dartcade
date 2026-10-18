<script lang="ts">
  // Settings' Lights: WLED devices the bridge found on the board's network but that aren't
  // paired yet, a Rescan button, and "Add by IP" for one the scan missed.
  import { Lightbulb } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import type { FoundWledDevice } from '$lib/api'
  import { since } from '$lib/lights/view'

  let {
    found,
    lastScanAt,
    scanError,
    probe,
    disabled = false,
    now,
    onpair,
    onprobe,
  }: {
    found: FoundWledDevice[]
    lastScanAt: string | null
    scanError: string | null
    probe: { host: string; error?: string } | null
    disabled?: boolean
    now: Date
    onpair: (device: FoundWledDevice) => void
    /** Resolves to whether the bridge accepted the request (not whether a device answered). */
    onprobe: (host: string) => Promise<boolean>
  } = $props()

  let ip = $state('')
  // The host this session last submitted, so a stale probe result from the server never shows
  let submittedHost = $state<string | null>(null)

  async function add() {
    const host = ip.trim()
    submittedHost = host
    if (await onprobe(host)) ip = ''
  }
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center justify-between gap-3">
    <span class="text-[12px] font-bold uppercase tracking-[0.1em] text-text-dim whitespace-nowrap">Found on this board's network</span>
    {#if lastScanAt}
      <span class="inline-flex items-center gap-[6px] text-[12px] text-text-dim whitespace-nowrap">
        <span class="w-[7px] h-[7px] rounded-full bg-accent"></span>Scanning · {since(lastScanAt, now)}
      </span>
    {/if}
  </div>
  {#if scanError}<ErrorText>Couldn't scan this network: {scanError}</ErrorText>{/if}
  <ul class="m-0 p-0 list-none flex flex-col gap-[6px]">
    {#each found as device (device.mac)}
      <li class="flex items-center gap-3 h-[54px] px-3 rounded-[10px] border border-dashed border-line-chip">
        <span class="flex text-text-dim"><Lightbulb size={18} strokeWidth={1.8} /></span>
        <span class="flex flex-col gap-[2px] min-w-0 flex-grow">
          <span class="text-[14px] font-semibold">{device.name}</span>
          <span class="font-mono text-[12px] text-text-dim">{device.host} · {device.leds} LEDs · {device.version}</span>
        </span>
        {#if device.onBoard}
          <span class="text-[12px] text-text-dim whitespace-nowrap">On {device.onBoard}</span>
        {:else}
          <Button variant="accent" size="sm" {disabled} onclick={() => onpair(device)}>Pair</Button>
        {/if}
      </li>
    {:else}
      <li class="text-[13px] text-text-dim">None found yet.</li>
    {/each}
  </ul>
  <div class="flex flex-col gap-[6px]">
    <span class="text-[13px] font-semibold text-ink-2">Not listed? Add by IP</span>
    <div class="flex gap-2">
      <Input placeholder="192.168.1.90" aria-label="WLED device IP address" bind:value={ip} {disabled} class="h-10 font-mono text-[14px]" />
      <Button variant="outline" size="md" disabled={disabled || !ip.trim()} onclick={() => void add()}>Add</Button>
    </div>
    {#if probe?.error && probe.host === submittedHost}<ErrorText>No WLED answered at {probe.host}</ErrorText>{/if}
    <span class="text-[12px] text-text-dim">
      Local addresses only. The bridge checks that the device answers as WLED before it sends anything.
    </span>
  </div>
</div>
