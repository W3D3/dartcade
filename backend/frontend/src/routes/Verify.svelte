<script lang="ts">
  // Landing page for the mail Register/Login just triggered. A verification link itself goes
  // straight to its destination (verifyCallback); this page is only "check your inbox" plus resend,
  // or (an expired/invalid link, or no email known at all) a way to get a fresh one.
  import { querystring } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import AuthPanel from '$lib/components/AuthPanel.svelte'
  import AuthHero from '$lib/components/AuthHero.svelte'
  import StepBars from '$lib/components/StepBars.svelte'
  import { authClient } from '$lib/auth'
  import { sessionStore, peekReturn } from '$lib/returnTo'
  import { verifyCallback, cooldownLeft, showEmailField } from '$lib/verify'

  const params = new URLSearchParams($querystring ?? '')
  const queryError = params.get('error')
  const queryEmail = params.get('email') ?? ''

  let email = $state(queryEmail)
  // A fresh sign-up, or a sign-in that got sent a fresh link (sendOnSignIn), already sent one
  let lastSentAt = $state<number | null>(queryError ? null : queryEmail ? Date.now() : null)
  let now = $state(Date.now())
  let resendError = $state('')
  let loading = $state(false)

  const cooldown = $derived(cooldownLeft(lastSentAt, now))

  $effect(() => {
    if (lastSentAt === null) return
    const t = setInterval(() => {
      now = Date.now()
      if (cooldownLeft(lastSentAt, now) <= 0) clearInterval(t)
    }, 1000)
    return () => clearInterval(t)
  })

  async function resend() {
    if (!email || cooldown > 0 || loading) return
    loading = true
    resendError = ''
    try {
      const { error: err } = await authClient.sendVerificationEmail({
        email,
        callbackURL: verifyCallback(peekReturn(sessionStore())),
      })
      if (err) {
        resendError = err.status === 429 ? 'Try again in a minute.' : (err.message ?? 'Could not send the email')
        return
      }
      lastSentAt = Date.now()
    } finally {
      loading = false
    }
  }
</script>

<div class="flex flex-col md:flex-row min-h-dvh bg-bg">
  <AuthPanel />
  <AuthHero />

  <main class="flex flex-grow md:items-center md:justify-center">
    <div class="flex w-full md:w-[440px] flex-col gap-5 md:gap-7 box-border px-5 py-6 md:p-0">
      <div class="flex flex-col gap-2">
        {#if queryError}
          <h1 class="m-0 font-display font-bold text-[34px] md:text-[44px] xl:text-[48px] uppercase tracking-[0.02em] leading-none">
            That link has expired
          </h1>
        {:else}
          <StepBars step={2} label="Verify email" />
          <h1 class="m-0 font-display font-bold text-[34px] md:text-[44px] xl:text-[48px] uppercase tracking-[0.02em] leading-none">
            Check your inbox
          </h1>
          {#if email}
            <p class="m-0 text-[16px] text-text-muted">
              We sent a link to <strong class="text-text font-semibold">{email}</strong>. Open it on this device to finish signing up.
            </p>
          {/if}
        {/if}
      </div>

      <form
        onsubmit={e => {
          e.preventDefault()
          void resend()
        }}
        class="flex flex-col gap-4"
      >
        {#if showEmailField(queryEmail)}
          <div class="flex flex-col gap-2">
            <label for="verify-email" class="field-label">Email</label>
            <Input id="verify-email" type="email" bind:value={email} autocomplete="email" placeholder="you@example.com" required />
          </div>
        {/if}

        {#if resendError}
          <ErrorText>{resendError}</ErrorText>
        {/if}

        <Button type="submit" variant="primary" disabled={loading || !email || cooldown > 0} class="w-full">
          {#if queryError}
            Send a new link
          {:else if cooldown > 0}
            Resend in {cooldown} s
          {:else}
            Resend verification email
          {/if}
        </Button>
      </form>

      <a href="#/register" class="self-center text-[14px] no-underline">Wrong address? Start over</a>
    </div>
  </main>
</div>
