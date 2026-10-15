<script lang="ts">
  // The game settings' volume (0–1) as a slider with its percentage. Sounds and the caller share it.
  let { value = $bindable(), label = 'Volume' }: { value: number; label?: string } = $props()
</script>

<label class="flex items-center gap-3 md:gap-4">
  <span class="text-[15px] shrink-0 w-28">{label}</span>
  <input
    type="range"
    min="0"
    max="100"
    step="5"
    value={Math.round(value * 100)}
    oninput={e => (value = Number(e.currentTarget.value) / 100)}
    class="flex-1 min-w-0 accent-accent"
  />
  <span class="font-mono text-[13px] text-text-muted w-11 text-right">{Math.round(value * 100)}%</span>
</label>
