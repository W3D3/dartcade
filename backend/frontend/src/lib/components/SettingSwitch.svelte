<script lang="ts">
  // A setting that's on or off: its label (and a line under it) and a switch on the right.
  import PreviewButton from '$lib/components/PreviewButton.svelte'
  import { Switch } from '$lib/components/ui/switch/index.js'

  let {
    id,
    label,
    sub,
    checked = $bindable(),
    onchange,
    onpreview,
  }: {
    id: string
    label: string
    sub?: string
    checked: boolean
    /** After a tap flipped it (a user gesture, e.g. to wake audio). */
    onchange?: (checked: boolean) => void
    /** Adds a play button beside the switch that previews the setting; returns how long the sound rings, in seconds. */
    onpreview?: () => number | Promise<number>
  } = $props()
</script>

<div class="flex items-center justify-between gap-4">
  <span class="flex flex-col gap-[2px]">
    <span {id} class="text-[15px] text-text">{label}</span>
    {#if sub}<span class="text-[13px] text-text-dim">{sub}</span>{/if}
  </span>
  <span class="flex items-center gap-3">
    {#if onpreview}
      <PreviewButton label="Preview {label}" onplay={onpreview} />
    {/if}
    <Switch bind:checked onCheckedChange={onchange} aria-labelledby={id} />
  </span>
</div>
