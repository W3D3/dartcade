<script lang="ts">
  // A player's name that opens their profile card (Player-Profile board): hover shows it after a
  // short delay, click, Enter or tap toggles it, Esc closes it and returns focus. It sits in a
  // popover layer (no scroll area clips it), below the name, flipping above near the bottom edge.
  // Without progression (or for a guest or bot: no `userId`) it is just the content.
  import type { Snippet } from 'svelte'
  import { Popover } from 'bits-ui'
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
  let open = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  const hover = (next: boolean) => {
    clearTimeout(timer)
    timer = setTimeout(() => (open = next), next ? 350 : 200)
  }
  // svelte-ignore state_referenced_locally (a row shows one player)
  const profile = userId ? profileOf(userId) : null
  // svelte-ignore state_referenced_locally
  const status = userId ? statusOf(userId) : null
</script>

{#if userId && $progression && profile}
  <Popover.Root
    bind:open
    onOpenChange={o => {
      if (o && userId) refreshProfile(userId)
    }}
  >
    <Popover.Trigger
      aria-label="{name}: profile"
      onmouseenter={() => hover(true)}
      onmouseleave={() => hover(false)}
      class="min-w-0 max-w-full inline-flex items-center gap-[6px] bg-transparent border-0 p-0 text-inherit text-left cursor-pointer font-[inherit] {className}"
    >
      {@render children()}
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        class="z-50 outline-none"
        onmouseenter={() => hover(true)}
        onmouseleave={() => hover(false)}
      >
        {#if $profile}
          <ProfileCard profile={$profile} status={status ? $status : null}>
            {#snippet actions()}
              <a
                href="#/profile/{userId}"
                onclick={() => (open = false)}
                class="flex-1 rounded-[10px] border border-line-strong py-[11px] text-center font-display font-bold text-[17px] uppercase tracking-[0.08em] text-inherit no-underline"
                >Profile</a
              >
            {/snippet}
          </ProfileCard>
        {:else}
          <div class="w-[300px] h-[200px] rounded-[16px] border border-line-popover bg-surface-2"></div>
        {/if}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
{:else}
  <span class="min-w-0 max-w-full inline-flex items-center gap-[6px] {className}">{@render children()}</span>
{/if}
