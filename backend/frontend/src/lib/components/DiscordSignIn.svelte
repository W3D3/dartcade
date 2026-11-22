<script lang="ts">
  // "Continue with Discord" under the sign-in and register forms, only when the deployment has it
  // (GET /api/auth-info). No terms checkbox: continuing accepts them, as the line under it says,
  // and the server records it when the account is made.
  import { Button } from '$lib/components/ui/button/index.js'
  import { authClient } from '$lib/auth'
  import { authInfo } from '$lib/authInfo'
  import { sessionStore, takeReturn } from '$lib/returnTo'
  import { discordSignIn } from '$lib/discord'
  import { hrefs } from '$lib/routes'
  import DiscordMark from './DiscordMark.svelte'

  let busy = $state(false)

  async function start() {
    busy = true
    try {
      // On success the browser goes to Discord and back; only a refusal to start lands here
      const { error } = await authClient.signIn.social(discordSignIn(takeReturn(sessionStore())))
      if (error) busy = false
    } catch {
      busy = false
    }
  }
</script>

{#if $authInfo.discord}
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-3 text-small text-ink-faint" aria-hidden="true">
      <span class="h-px flex-1 bg-line"></span>or<span class="h-px flex-1 bg-line"></span>
    </div>
    <Button type="button" variant="outline" class="w-full" disabled={busy} onclick={start}>
      <DiscordMark size={18} />Continue with Discord
    </Button>
    <p class="text-kicker/normal text-text-muted text-center">
      By continuing you agree to the <a href={hrefs.legal('terms')}>Terms</a> and <a href={hrefs.legal('privacy')}>Privacy Policy</a>.
    </p>
  </div>
{/if}
