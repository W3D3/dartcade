<script lang="ts">
  // A player's name that links to their profile and previews it (Player-Profile board): hovering, or
  // tabbing onto it, shows their profile card after a short delay (bits-ui LinkPreview); a click, Enter
  // or tap opens the profile itself. Touch has no hover, so a tap goes straight there. The card sits in
  // a popover layer (no scroll area clips it), below the name, flipping above near the bottom edge.
  // Without progression (or for a guest or bot: no `userId`) it is just the content.
  import type { Snippet } from 'svelte'
  import { LinkPreview } from 'bits-ui'
  import ProfileCard from './ProfileCard.svelte'
  import { flag } from '$lib/flags'
  import { profileOf, refreshProfile, statusOf } from '$lib/progress/profiles'

  let {
    userId,
    name,
    class: className = '',
    children,
  }: { userId: string | null; name: string; class?: string; children: Snippet } = $props()

  const progression = flag('progression.enabled')
  // svelte-ignore state_referenced_locally (a row shows one player)
  const profile = userId ? profileOf(userId) : null
  // svelte-ignore state_referenced_locally
  const status = userId ? statusOf(userId) : null
</script>

{#if userId && $progression && profile}
  <LinkPreview.Root openDelay={350} closeDelay={200} onOpenChange={o => o && refreshProfile(userId)}>
    <LinkPreview.Trigger>
      {#snippet child({ props })}
        <!-- A plain link: bits-ui gives the trigger role=button, which would hide that it navigates -->
        <a
          {...props}
          role={undefined}
          href="#/profile/{userId}"
          aria-label="{name}: profile"
          class="min-w-0 max-w-full inline-flex items-center gap-[6px] no-underline !text-inherit [text-transform:inherit] {className}"
        >
          {@render children()}
        </a>
      {/snippet}
    </LinkPreview.Trigger>
    <LinkPreview.Portal>
      <LinkPreview.Content side="bottom" align="start" sideOffset={8} collisionPadding={16} class="z-50 outline-none">
        {#if $profile}
          <ProfileCard profile={$profile} status={status ? $status : null} />
        {:else}
          <div class="w-[300px] h-[200px] rounded-[16px] border border-line-popover bg-surface-2"></div>
        {/if}
      </LinkPreview.Content>
    </LinkPreview.Portal>
  </LinkPreview.Root>
{:else}
  <span class="min-w-0 max-w-full inline-flex items-center gap-[6px] {className}">{@render children()}</span>
{/if}
