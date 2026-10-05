<script lang="ts">
  import { push } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Input } from '$lib/components/ui/input/index.js'
  import AuthPanel from '$lib/components/AuthPanel.svelte'
  import AuthHero from '$lib/components/AuthHero.svelte'
  import NameField from '$lib/components/NameField.svelte'
  import { authClient, currentUser } from '$lib/auth'
  import { nameSendable, type NameStatus } from '$lib/names'
  import { sessionStore, takeReturn } from '$lib/returnTo'

  let name = $state('')
  let nameStatus = $state<NameStatus>({ kind: 'empty' })
  let email = $state('')
  let password = $state('')
  let acceptTerms = $state(false)
  let error = $state('')
  let loading = $state(false)

  let strength = $derived.by(() => {
    if (!password) return 0
    let s = 0
    if (password.length >= 8) s++
    if (password.length >= 12) s++
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++
    if (/[0-9]/.test(password) || /[^a-zA-Z0-9]/.test(password)) s++
    return s
  })

  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  const strengthColors = ['', '#ff5a4f', '#f59e0b', '#84cc16', '#c6f24e']

  async function submit() {
    if (!acceptTerms) {
      error = 'Please accept the terms'
      return
    }
    loading = true
    error = ''
    try {
      const { error: err } = await authClient.signUp.email({ name, email, password })
      if (err) {
        error = err.message ?? 'Registration failed'
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
        <p class="m-0 font-mono text-[13px] tracking-[0.08em] text-accent">Step 1 of 2</p>
        <h1 class="m-0 font-display font-bold text-[34px] md:text-[44px] xl:text-[48px] uppercase tracking-[0.02em] leading-none">
          Create account
        </h1>
        <p class="hidden md:block m-0 text-[16px] text-text-muted">Your name is your handle: friends find you as @name.</p>
      </div>

      <div class="flex flex-col gap-[18px]">
        <NameField id="reg-name" label="Name" bind:value={name} bind:status={nameStatus} />
        <div class="flex flex-col gap-2">
          <label for="reg-email" class="field-label">Email</label>
          <Input id="reg-email" type="email" bind:value={email} autocomplete="email" placeholder="you@example.com" required />
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
          {#if password}
            <div class="flex gap-1 mt-1">
              {#each [1, 2, 3, 4] as lvl (lvl)}
                <div
                  class="h-1 flex-1 rounded-full transition-colors"
                  style:background={lvl <= strength ? strengthColors[strength] : 'var(--color-line-2)'}
                ></div>
              {/each}
            </div>
            <p class="m-0 text-[13px]" style:color={strengthColors[strength]}>
              {strengthLabels[strength]}
            </p>
          {/if}
        </div>
        <label class="flex items-center gap-[10px] text-[15px] text-ink-2 min-h-[44px] cursor-pointer">
          <input type="checkbox" bind:checked={acceptTerms} class="w-[18px] h-[18px] m-0 accent-accent" />
          I agree to the <a href="#/terms" class="font-semibold">terms of service</a>
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
      </Button>

      <p class="m-0 text-[15px] text-text-muted text-center">
        Already have an account?
        <a href="#/login" class="font-semibold no-underline">Sign in</a>
      </p>
    </form>
  </main>
</div>
