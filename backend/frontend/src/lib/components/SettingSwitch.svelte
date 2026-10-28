<script lang="ts">
  // A setting that's on or off: its label (and a line under it) and a switch on the right.
  import { Switch } from '$lib/components/ui/switch/index.js'

  let {
    id,
    label,
    sub,
    checked = $bindable(),
    onchange,
  }: {
    id: string
    label: string
    sub?: string
    checked: boolean
    /** After a tap flipped it (a user gesture, e.g. to wake audio). */
    onchange?: (checked: boolean) => void
  } = $props()
</script>

<div class="flex items-center justify-between gap-4">
  <span class="flex flex-col gap-[2px]">
    <span {id} class="text-[15px] text-text">{label}</span>
    {#if sub}<span class="text-[13px] text-text-dim">{sub}</span>{/if}
  </span>
  <Switch bind:checked onCheckedChange={onchange} aria-labelledby={id} />
</div>
