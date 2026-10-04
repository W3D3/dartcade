<script lang="ts">
  // The line under a name field: the rule, a hint, "Checking…", free or taken.
  import { nameStatusText, type NameStatus } from '$lib/names'

  let { id, status }: { id: string; status: NameStatus } = $props()
  const tone = $derived(status.kind === 'available' ? 'text-accent' : status.kind === 'taken' || status.kind === 'invalid' ? 'text-live-text' : 'text-text-dim')
</script>

<span {id} role="status" class="text-[13px] {tone}">{nameStatusText(status)}</span>
