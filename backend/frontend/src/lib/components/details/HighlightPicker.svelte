<script lang="ts">
  // Party: whose line and chalkboard stand out.
  let { options, value, onpick }: { options: { key: number; name: string }[]; value: number; onpick: (key: number) => void } = $props()
</script>

<label class="flex items-center gap-2 text-[13px] text-text-muted">
  Highlight
  <select
    {value}
    onchange={e => onpick(Number(e.currentTarget.value))}
    class="h-9 px-2 rounded-[8px] bg-surface-inset border border-line-strong text-text text-[14px] font-[inherit]"
    aria-label="Highlight a player"
  >
    {#each options as o (o.key)}<option value={o.key}>{o.name}</option>{/each}
  </select>
</label>
