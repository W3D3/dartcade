<script lang="ts">
  // Party: whose line and chalkboard stand out.
  import { Select } from '$lib/components/ui/select/index.js'

  let { options, value, onpick }: { options: { key: number; name: string }[]; value: number; onpick: (key: number) => void } = $props()
</script>

<div class="flex items-center gap-2 text-[13px] text-text-muted">
  Highlight
  <Select
    label="Highlight a player"
    class="h-9 rounded-[8px] border-line-strong bg-surface-inset"
    value={String(value)}
    options={options.map(o => ({ value: String(o.key), label: o.name }))}
    onchange={(v: string) => onpick(Number(v))}
  />
</div>
