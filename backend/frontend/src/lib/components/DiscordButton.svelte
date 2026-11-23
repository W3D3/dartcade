<script lang="ts">
  // "Join our Discord" in the side nav (row) and the tablet rail (small, icon only); renders only
  // when the deployment sets DISCORD_INVITE_URL (GET /api/auth-info).
  import { MessageCircle } from '@lucide/svelte'
  import { authInfo } from '$lib/authInfo'

  let { variant = 'row' }: { variant?: 'row' | 'small' } = $props()
</script>

{#if $authInfo.discordInviteUrl}
  <a
    href={$authInfo.discordInviteUrl}
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Join our Discord"
    title="Join our Discord"
    class="flex items-center no-underline text-ink-2 font-medium transition-colors hover:text-text
      {variant === 'row' ? 'h-11 gap-3 px-3 rounded-sm text-label' : 'size-9 justify-center rounded-md'}"
  >
    <MessageCircle size={variant === 'row' ? 20 : 18} strokeWidth={1.8} />
    {#if variant === 'row'}Join our Discord{/if}
  </a>
{/if}
