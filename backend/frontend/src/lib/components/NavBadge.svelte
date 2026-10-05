<script lang="ts">
  // A small lime count (pending invites, friend requests) on a tab, a nav link or an avatar.
  // hidden: the thing it sits on already says the count, so screen readers skip it.
  let { count, label, hidden = false, class: className = '' }: { count: number; label: string; hidden?: boolean; class?: string } = $props()
</script>

<span
  aria-label={hidden ? undefined : label}
  aria-hidden={hidden ? 'true' : undefined}
  class="h-[18px] min-w-[18px] box-border px-[5px] rounded-[9px] bg-accent text-accent-fg text-[11px] font-bold flex items-center justify-center {className}"
  >{count}</span
>
