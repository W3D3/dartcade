<script lang="ts">
  // A small lime count (pending invites) on a tab or a nav link.
  let { count, label, class: className = '' }: { count: number; label: string; class?: string } = $props()
</script>

<span aria-label={label}
  class="h-[18px] min-w-[18px] box-border px-[5px] rounded-[9px] bg-accent text-accent-fg text-[11px] font-bold flex items-center justify-center {className}">{count}</span>
