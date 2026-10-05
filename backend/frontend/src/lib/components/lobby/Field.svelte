<script lang="ts">
  // A small label above a control (start score, check-out, throw order).
  import type { Snippet } from 'svelte'

  let { label, children }: { label: string; children: Snippet } = $props()
</script>

<div class="flex flex-col gap-[6px]">
  <span class="field-label max-md:text-[13px]">{label}</span>
  {@render children()}
</div>
