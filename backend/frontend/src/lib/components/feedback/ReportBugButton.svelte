<script lang="ts">
  // "Report a bug" on every screen that has a nav or header: opens the bug report dialog. Signed in
  // only (POST /api/feedback needs an account) and only on a server that takes reports.
  // row: the side nav's own full-width item, with its label; labelled: the icon, with the label from lg up
  // (the wide game headers); icon: just the bug, a 44 px target; small: 36 px, for the tablet rail.
  import { Bug } from '@lucide/svelte'
  import { authInfo } from '$lib/authInfo'
  import { currentUser } from '$lib/auth'
  import { openFeedback, SCREENSHOT_SKIP_ATTR } from '$lib/feedback/report'

  let { variant = 'icon' }: { variant?: 'row' | 'labelled' | 'icon' | 'small' } = $props()

  const SHAPE = {
    row: 'h-10 w-full gap-2 text-label font-medium',
    labelled: 'h-11 w-11 lg:w-auto lg:px-3 gap-2 text-label font-medium',
    icon: 'size-11',
    small: 'size-9',
  } as const
  const withLabel = $derived(variant === 'row' || variant === 'labelled')
</script>

{#if $authInfo.feedback && $currentUser}
  <button
    type="button"
    onclick={() => void openFeedback()}
    aria-label="Report a bug"
    title="Report a bug"
    {...{ [SCREENSHOT_SKIP_ATTR]: '' }}
    class="shrink-0 flex items-center justify-center cursor-pointer rounded-md border border-bug/40 bg-bug/10 text-bug transition-colors
      hover:bg-bug/20 focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2 {SHAPE[variant]}"
  >
    <Bug size={18} strokeWidth={1.8} />
    {#if withLabel}<span class={variant === 'labelled' ? 'hidden lg:inline' : ''}>Report a bug</span>{/if}
  </button>
{/if}
