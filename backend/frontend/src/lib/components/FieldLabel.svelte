<script lang="ts">
  // A <label> that stacks its caption over the field it wraps.
  import type { Snippet } from 'svelte'

  let { children }: { children: Snippet } = $props()
</script>

<label class="flex flex-col gap-2 text-[13px] label-caps text-text-dim">{@render children()}</label>
