<script lang="ts">
  // A setting that's on or off: its label (and a line under it) and a switch on the right.
  import { Play } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Switch } from '$lib/components/ui/switch/index.js'

  let {
    id,
    label,
    sub,
    checked = $bindable(),
    onchange,
    onpreview,
    previewing = false,
  }: {
    id: string
    label: string
    sub?: string
    checked: boolean
    /** After a tap flipped it (a user gesture, e.g. to wake audio). */
    onchange?: (checked: boolean) => void
    /** Adds a play button beside the switch that previews the setting. */
    onpreview?: () => void
    /** The preview is sounding: its button is disabled and pulses. */
    previewing?: boolean
  } = $props()
</script>

<div class="flex items-center justify-between gap-4">
  <span class="flex flex-col gap-[2px]">
    <span {id} class="text-[15px] text-text">{label}</span>
    {#if sub}<span class="text-[13px] text-text-dim">{sub}</span>{/if}
  </span>
  <span class="flex items-center gap-3">
    {#if onpreview}
      <Button variant="quiet" size="icon-sm" aria-label="Preview {label}" disabled={previewing} onclick={onpreview}>
        <Play size={16} class={previewing ? 'animate-pulse text-accent' : ''} />
      </Button>
    {/if}
    <Switch bind:checked onCheckedChange={onchange} aria-labelledby={id} />
  </span>
</div>
