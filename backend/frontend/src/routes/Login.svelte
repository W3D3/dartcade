<script lang="ts">
  import { push, querystring } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Input } from '$lib/components/ui/input/index.js'
  import AuthPanel from '$lib/components/AuthPanel.svelte'
  import AuthHero from '$lib/components/AuthHero.svelte'
  import { authClient, currentUser } from '$lib/auth'
  import { authInfo } from '$lib/authInfo'
  import { sessionStore, takeReturn, peekReturn } from '$lib/returnTo'
  import { verifyCallback } from '$lib/verify'
  import DevUserSwitch from '$lib/components/DevUserSwitch.svelte'
  import AuthFooter from '$lib/components/AuthFooter.svelte'

  const justReset = new URLSearchParams($querystring ?? '').get('reset') === '1'

  let email = $state('')
  let password = $state('')
  let keepSignedIn = $state(true)
  let error = $state('')
  let loading = $state(false)

  async function submit() {
    loading = true
    error = ''
    try {
      const { error: err } = await authClient.signIn.email({ email, password })
      if (err) {
        if (err.code === 'EMAIL_NOT_VERIFIED') {
          // sendOnSignIn is off (it would mail a link back to "/"); send our own, with the
          // right callbackURL. Don't pass callbackURL to signIn.email itself: the client then
          // does a full-page redirect on success instead of letting us route in the SPA.
          await authClient.sendVerificationEmail({ email, callbackURL: verifyCallback(peekReturn(sessionStore())) })
          void push(`/verify?email=${encodeURIComponent(email)}&sent=1`)
          return
        }
        error = err.message ?? 'Invalid credentials'
        return
      }
      await currentUser.refresh()
      void push(takeReturn(sessionStore()))
    } finally {
      loading = false
    }
  }
</script>

<div class="flex flex-col md:flex-row min-h-dvh bg-bg">
  <AuthPanel />
  <AuthHero />

  <main class="flex flex-grow md:items-center md:justify-center">
    <form
      onsubmit={e => {
        e.preventDefault()
        void submit()
      }}
      class="flex w-full md:w-[400px] flex-col gap-5 md:gap-7 box-border px-5 py-6 md:p-0"
    >
      <div class="flex flex-col gap-2">
        <h1 class="m-0 font-display font-bold text-[34px] md:text-[44px] xl:text-[48px] uppercase tracking-[0.02em] leading-none">
          Sign in
        </h1>
        <p class="hidden md:block m-0 text-[16px] text-text-muted">Welcome back. Your boards are waiting.</p>
      </div>

      {#if justReset}
        <p class="m-0 text-[14px] text-accent">Password changed. Sign in with the new one.</p>
      {/if}

      <div class="flex flex-col gap-[18px]">
        <div class="flex flex-col gap-2">
          <label for="login-email" class="field-label">Email</label>
          <Input id="login-email" type="email" bind:value={email} autocomplete="email" placeholder="you@example.com" required />
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex justify-between items-baseline">
            <label for="login-password" class="field-label">Password</label>
            {#if $authInfo.mail}
              <a href="#/forgot" class="text-[14px] no-underline">Forgot password?</a>
            {/if}
          </div>
          <Input
            id="login-password"
            type="password"
            bind:value={password}
            autocomplete="current-password"
            placeholder="••••••••"
            required
          />
        </div>

        <label class="flex items-center gap-[10px] text-[15px] text-ink-2 min-h-[44px] cursor-pointer">
          <input type="checkbox" bind:checked={keepSignedIn} class="w-[18px] h-[18px] m-0 accent-accent" />
          Keep me signed in on this device
        </label>
      </div>

      {#if error}
        <ErrorText>{error}</ErrorText>
      {/if}

      <div class="flex flex-col gap-3 mt-auto md:mt-0">
        <Button type="submit" variant="primary" disabled={loading} class="w-full">
          {loading ? '…' : 'Sign in'}
        </Button>

        {#if import.meta.env.DEV}
          <DevUserSwitch markCurrent={false} />
        {/if}
      </div>

      <p class="m-0 text-[15px] text-text-muted text-center">
        New to Dartcade?
        <a href="#/register" class="font-semibold no-underline">Create an account</a>
      </p>

      <AuthFooter />
    </form>
  </main>
</div>
