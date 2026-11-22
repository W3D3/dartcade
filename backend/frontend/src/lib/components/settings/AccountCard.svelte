<script lang="ts">
  // Settings' Profile: the account itself (Settings board). Read-only for now, plus Sign out.
  import SettingsCard from '$lib/components/settings/SettingsCard.svelte'
  import { LogOut } from '@lucide/svelte'
  import { currentUser, signOut } from '$lib/auth'
  import DeleteAccount from './DeleteAccount.svelte'
  import TimeZoneField from './TimeZoneField.svelte'
  import { flag } from '$lib/flags'
  import { LOCALE } from '$lib/fmt'

  const progression = flag('progression.enabled')

  const signedInWith = (methods: ('password' | 'discord')[]) =>
    methods.map(m => (m === 'password' ? 'Email and password' : 'Discord')).join(' or ') || 'Email and password'

  const user = $derived($currentUser)
  const joined = $derived(new Date(user?.createdAt ?? NaN))
  const since = $derived(isNaN(joined.getTime()) ? '' : joined.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }))
</script>

{#if user}
  <SettingsCard id="account-title" title="Account" description="Only your username can be changed for now.">
    <dl class="flex flex-col">
      <div class="flex items-center justify-between gap-3 min-h-12 border-t border-surface-paused">
        <dt class="text-[14px] text-text-muted">Email</dt>
        <dd class={['min-w-0 truncate text-[14px]', user.email ? 'font-mono text-ink-2' : 'text-text-dim']}>
          {user.email ?? 'Not shared by Discord'}
        </dd>
      </div>
      <div class="flex items-center justify-between gap-3 min-h-12 border-t border-surface-paused">
        <dt class="text-[14px] text-text-muted">Signed in with</dt>
        <dd class="text-[14px] text-ink-2">{signedInWith(user.signInMethods)}</dd>
      </div>
      {#if since}
        <div class="flex items-center justify-between gap-3 min-h-12 border-t border-surface-paused">
          <dt class="text-[14px] text-text-muted">Member since</dt>
          <dd class="text-[14px] text-ink-2">{since}</dd>
        </div>
      {/if}
    </dl>
    {#if $progression}<TimeZoneField />{/if}
    <button
      type="button"
      onclick={() => void signOut()}
      class="self-start h-11 px-4 flex items-center gap-2 rounded-md border border-danger-line text-live-text
 text-[14px] font-semibold cursor-pointer transition-colors hover:bg-live-soft"
    >
      <LogOut size={16} />Sign out
    </button>
    <div class="h-px bg-surface-paused"></div>
    <DeleteAccount />
  </SettingsCard>
{/if}
