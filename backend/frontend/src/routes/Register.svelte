<script lang="ts">
  import { Checkbox } from '$lib/components/ui/checkbox/index.js'
  import { push } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Input } from '$lib/components/ui/input/index.js'
  import { ArrowRight } from '@lucide/svelte'
  import AuthPanel from '$lib/components/AuthPanel.svelte'
  import AuthHero from '$lib/components/AuthHero.svelte'
  import NameField from '$lib/components/NameField.svelte'
  import PasswordStrength from '$lib/components/PasswordStrength.svelte'
  import AuthFooter from '$lib/components/AuthFooter.svelte'
  import StepBars from '$lib/components/StepBars.svelte'
  import DiscordSignIn from '$lib/components/DiscordSignIn.svelte'
  import { get } from 'svelte/store'
  import { authClient, currentUser } from '$lib/auth'
  import { authInfo } from '$lib/authInfo'
  import { nameSendable, type NameStatus } from '$lib/names'
  import { sessionStore, takeReturn, peekReturn } from '$lib/returnTo'
  import { verifyCallback, rememberCredentials } from '$lib/verify'

  let name = $state('')
  let nameStatus = $state<NameStatus>({ kind: 'empty' })
  let email = $state('')
  let password = $state('')
  let acceptTerms = $state(false)
  let error = $state('')
  let loading = $state(false)

  async function submit() {
    if (!acceptTerms) {
      error = 'Please accept the terms'
      return
    }
    loading = true
    error = ''
    try {
      const callbackURL = verifyCallback(peekReturn(sessionStore()))
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- acceptTerms isn't in better-auth's client types; the backend's termsGate requires it in the body
      const { error: err } = await authClient.signUp.email({ name, email, password, acceptTerms: true, callbackURL } as Parameters<
        typeof authClient.signUp.email
      >[0])
      if (err) {
        error = err.message ?? 'Registration failed'
        return
      }
      // loadOnce's subscribe-triggered fetch may not have resolved yet; wait for a fresh read
      await authInfo.refresh()
      if (get(authInfo).verification) {
        rememberCredentials(email, password)
        void push(`/verify?email=${encodeURIComponent(email)}`)
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
  <AuthPanel variant="register" />
  <AuthHero />

  <main class="flex flex-grow md:items-center md:justify-center">
    <form
      onsubmit={e => {
        e.preventDefault()
        void submit()
      }}
      class="flex w-full md:w-[400px] flex-col gap-5 md:gap-[26px] box-border px-5 py-6 md:p-0"
    >
      <div class="flex flex-col gap-[14px]">
        <StepBars step={1} label="Account" />
        <h1 class="m-0 font-display font-bold text-[34px] md:text-[44px] xl:text-[48px] uppercase tracking-[0.02em] leading-none">
          Create account
        </h1>
      </div>

      <div class="flex flex-col gap-[18px]">
        <NameField
          id="reg-name"
          label="Player name"
          placeholder="e.g. OcheGhost"
          prefix={false}
          bind:value={name}
          bind:status={nameStatus}
        />
        <div class="flex flex-col gap-2">
          <label for="reg-email" class="field-label">Email</label>
          <Input id="reg-email" type="email" bind:value={email} autocomplete="username" placeholder="you@example.com" required />
        </div>
        <div class="flex flex-col gap-2">
          <label for="reg-password" class="field-label">Password</label>
          <Input
            id="reg-password"
            type="password"
            bind:value={password}
            autocomplete="new-password"
            placeholder="At least 8 characters"
            required
          />
          <PasswordStrength {password} />
        </div>
        <label class="flex items-start gap-[10px] text-[15px] leading-[1.45] text-ink-2 min-h-[44px] cursor-pointer">
          <Checkbox bind:checked={acceptTerms} class="mt-[2px]" />
          <span
            >I agree to the <a href="#/terms">Terms</a> and
            <a href="#/privacy">Privacy Policy</a>.</span
          >
        </label>
      </div>

      {#if error}
        <ErrorText>{error}</ErrorText>
      {/if}

      <Button
        type="submit"
        variant="primary"
        disabled={loading || !acceptTerms || !nameSendable(nameStatus)}
        class="w-full mt-auto md:mt-0"
      >
        {loading ? '…' : 'Create account'}
        {#if !loading}<ArrowRight size={20} strokeWidth={2.2} />{/if}
      </Button>

      <DiscordSignIn />

      <p class="m-0 text-[15px] text-text-muted text-center">
        Already have an account?
        <a href="#/login" class="font-semibold no-underline">Sign in</a>
      </p>

      <AuthFooter />
    </form>
  </main>
</div>
