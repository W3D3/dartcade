<script lang="ts">
  // Settings' Profile: you as others see you. With progression, your profile card and the way to
  // Customise (picture, banner, colours, title), the one place to change them; without it (the
  // profile API needs progression), or until the card loads, your avatar and name.
  import Avatar from '$lib/components/Avatar.svelte'
  import ProfileCard from '$lib/components/progress/ProfileCard.svelte'
  import { currentUser } from '$lib/auth'
  import { flag } from '$lib/flags'
  import { profileOf, statusOf } from '$lib/progress/profiles'

  const progression = flag('progression.enabled')
  const user = $derived($currentUser)
  const profile = $derived(user && $progression ? profileOf(user.id) : null)
  const status = $derived(user ? statusOf(user.id) : null)
</script>

{#if user}
  <section aria-label="Your card" class="box-border p-4 md:p-[22px] card flex flex-col sm:flex-row sm:items-center gap-4 md:gap-6">
    {#if profile && $profile}
      <div class="sm:shrink-0 max-w-full"><ProfileCard profile={$profile} status={status ? $status : null} /></div>
    {:else}
      <div class="flex items-center gap-4 min-w-0">
        <Avatar
          name={user.name}
          tone="accent"
          face={{ avatar: user.avatar, userId: user.id }}
          class="w-14 h-14 md:w-[72px] md:h-[72px] text-[24px] md:text-[30px]"
        />
        <div class="flex flex-col gap-[3px] min-w-0">
          <span class="text-[20px] md:text-[22px] font-semibold truncate">{user.name}</span>
          <span class="font-mono text-[14px] text-text-muted truncate">@{user.name}</span>
        </div>
      </div>
    {/if}
    {#if $progression}
      <div class="flex flex-col gap-3">
        <span class="text-[13px] leading-[1.5] text-text-muted"
          >Your picture, banner, colours and title. Friends see this card when they open your profile.</span
        >
        <a
          href="#/profile/customise"
          class="w-fit rounded-[10px] border border-accent bg-accent px-4 py-[10px] font-display font-bold text-[16px] uppercase tracking-[0.08em] text-accent-fg no-underline"
          >Customise</a
        >
      </div>
    {/if}
  </section>
{/if}
