<script lang="ts">
  // Pending invites at the top of the Play page; opens them.
  import { ChevronRight, Mail } from '@lucide/svelte'

  let { count }: { count: number } = $props()
</script>

<a
  href="#/invites"
  class="flex items-center gap-3 h-12 px-4 rounded-[12px] bg-surface-active border border-accent-line text-text no-underline"
>
  <Mail size={18} class="text-accent" />
  <span class="text-[14px]"
    ><strong>{count} {count === 1 ? 'invite' : 'invites'}</strong> <span class="text-text-muted">to a lobby</span></span
  >
  <ChevronRight size={16} class="ml-auto text-text-muted" />
</a>
