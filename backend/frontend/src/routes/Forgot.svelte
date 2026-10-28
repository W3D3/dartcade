<script lang="ts">
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import AuthPanel from '$lib/components/AuthPanel.svelte'
  import AuthHero from '$lib/components/AuthHero.svelte'
  import { authClient } from '$lib/auth'
  import { authInfo } from '$lib/authInfo'

  let email = $state('')
  let sent = $state(false)
  let error = $state('')
  let loading = $state(false)
  // authInfo's initial value says mail is off before it has loaded; without this, the page
  // would flash "isn't available" on every visit until the real value arrives.
  let infoLoaded = $state(false)
  void authInfo.refresh().then(() => {
    infoLoaded = true
  })

  async function submit() {
    loading = true
    error = ''
    try {
      const { error: err } = await authClient.requestPasswordReset({ email, redirectTo: `${location.origin}/#/reset` })
      if (err?.status === 429) {
        error = 'Try again in a minute.'
        return
      }
      sent = true
    } finally {
      loading = false
    }
  }
</script>

<div class="flex flex-col md:flex-row min-h-dvh bg-bg">
  <AuthPanel />
  <AuthHero />

  <main class="flex flex-grow md:items-center md:justify-center">
    <div class="flex w-full md:w-[400px] flex-col gap-5 md:gap-7 box-border px-5 py-6 md:p-0">
      {#if !infoLoaded}
        <!-- avoid flashing the "isn't available" message before /api/auth-info has loaded -->
      {:else if !$authInfo.mail}
        <p class="m-0 text-[16px] text-text-muted">Password reset isn't available on this server. Ask whoever runs it.</p>
      {:else}
        <form
          onsubmit={e => {
            e.preventDefault()
            void submit()
          }}
          class="flex flex-col gap-5 md:gap-7"
        >
          <div class="flex flex-col gap-2">
            <h1 class="m-0 font-display font-bold text-[34px] md:text-[44px] xl:text-[48px] uppercase tracking-[0.02em] leading-none">
              Reset password
            </h1>
            <p class="m-0 text-[16px] text-text-muted">Enter the email on your account and we'll send you a link.</p>
          </div>

          <div class="flex flex-col gap-2">
            <label for="forgot-email" class="field-label">Email</label>
            <Input id="forgot-email" type="email" bind:value={email} autocomplete="email" placeholder="you@example.com" required />
          </div>

          {#if error}
            <ErrorText>{error}</ErrorText>
          {/if}

          <Button type="submit" variant="primary" disabled={loading} class="w-full">Send reset link</Button>
        </form>

        {#if sent}
          <div class="h-px bg-line-2"></div>
          <div class="p-4 rounded-[10px] bg-surface-inset border border-line-popover">
            <p class="m-0 text-[15px] leading-[1.5] text-ink-soft">
              If that address has an account, we've sent a link. It's valid for an hour.
            </p>
          </div>
        {/if}

        <p class="m-0 text-[15px] text-text-muted text-center"><a href="#/login" class="font-semibold no-underline">Back to sign in</a></p>
      {/if}
    </div>
  </main>
</div>
