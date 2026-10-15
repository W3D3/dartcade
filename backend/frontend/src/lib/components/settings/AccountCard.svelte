<script lang="ts">
  // Settings' Profile: the account itself (Settings board). Read-only for now, plus Sign out.
  import { LogOut } from '@lucide/svelte'
  import { currentUser, signOut } from '$lib/auth'

  const user = $derived($currentUser)
  const joined = $derived(new Date(user?.createdAt ?? NaN))
  const since = $derived(isNaN(joined.getTime()) ? '' : joined.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }))
</script>

{#if user}
  <section aria-labelledby="account-title" class="box-border p-4 md:p-[22px] card flex flex-col gap-[14px]">
    <div class="flex flex-col gap-1">
      <h2 id="account-title" class="m-0 text-[17px] font-semibold">Account</h2>
      <p class="m-0 text-[13px] leading-[1.5] text-text-dim">Only your username can be changed for now.</p>
    </div>
    <dl class="m-0 flex flex-col">
      <div class="flex items-center justify-between gap-3 min-h-12 border-t border-surface-paused">
        <dt class="text-[14px] text-text-muted">Email</dt>
        <dd class="m-0 min-w-0 truncate font-mono text-[14px] text-ink-2">{user.email}</dd>
      </div>
      <div class="flex items-center justify-between gap-3 min-h-12 border-t border-surface-paused">
        <dt class="text-[14px] text-text-muted">Signed in with</dt>
        <!-- shortcut: email and password is the only way to sign in today; ask the account once there's another -->
        <dd class="m-0 text-[14px] text-ink-2">Email and password</dd>
      </div>
      {#if since}
        <div class="flex items-center justify-between gap-3 min-h-12 border-t border-surface-paused">
          <dt class="text-[14px] text-text-muted">Member since</dt>
          <dd class="m-0 text-[14px] text-ink-2">{since}</dd>
        </div>
      {/if}
    </dl>
    <button
      type="button"
      onclick={() => void signOut()}
      class="self-start h-11 px-4 flex items-center gap-2 rounded-[10px] border border-danger-line bg-transparent text-live-text
             text-[14px] font-semibold cursor-pointer font-[inherit] transition-colors hover:bg-live-soft"
    >
      <LogOut size={16} />Sign out
    </button>
  </section>
{/if}
