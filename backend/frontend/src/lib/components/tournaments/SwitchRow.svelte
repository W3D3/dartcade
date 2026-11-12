<script lang="ts">
  // A setting that is on or off: its name and what it does, the switch on the right.
  import { Switch } from '$lib/components/ui/switch/index.js'

  let {
    id,
    label,
    help,
    checked,
    onchange,
    disabled = false,
  }: { id: string; label: string; help: string; checked: boolean; onchange: (on: boolean) => void; disabled?: boolean } = $props()
</script>

<div class="flex items-start justify-between gap-4">
  <span class="flex min-w-0 flex-col gap-1">
    <label for={id} class="text-label font-semibold text-text">{label}</label>
    <span class="text-caption text-text-dim">{help}</span>
  </span>
  <Switch {id} {checked} {disabled} onCheckedChange={onchange} />
</div>
