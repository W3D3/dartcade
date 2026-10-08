<script lang="ts">
  // Dev builds only: one tap signs in as a seeded user (Admin and the darters).
  // Wrap it in {#if import.meta.env.DEV} where it's used.
  import { DEV_USERS, signInAs, type DevUser } from '$lib/devUsers'
  import { currentUser } from '$lib/auth'

  // `markCurrent` off (login page): nobody counts as signed in, so every button works
  let { label = 'Dev: sign in as', markCurrent = true }: { label?: string; markCurrent?: boolean } = $props()

  let busy = $state<string | null>(null)
  let error = $state('')

  async function pick(user: DevUser) {
    busy = user.email
    error = ''
    try {
      error = (await signInAs(user)) ?? ''
    } finally {
      busy = null
    }
  }
</script>

<div class="flex flex-col gap-2">
  <span class="text-[12px] uppercase tracking-[0.08em] text-text-dim">{label}</span>
  <div class="flex flex-wrap gap-2">
    {#each DEV_USERS as user (user.email)}
      {@const current = markCurrent && $currentUser?.email === user.email}
      <button
        type="button"
        disabled={busy !== null || current}
        onclick={() => void pick(user)}
        class="h-9 px-3 rounded-full border text-[14px] font-medium cursor-pointer disabled:cursor-default
               {current ? 'border-accent text-accent bg-transparent' : 'border-line-3 text-text bg-transparent'}
               {busy === user.email ? 'opacity-60' : ''}"
      >
        {user.name}
      </button>
    {/each}
  </div>
  {#if error}<span class="text-[13px] text-live-text">{error}</span>{/if}
</div>
