<script lang="ts">
  import { push } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import AuthPanel from '$lib/components/AuthPanel.svelte'
  import AuthHero from '$lib/components/AuthHero.svelte'
  import PasswordStrength from '$lib/components/PasswordStrength.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { authClient } from '$lib/auth'

  // better-auth's redirect puts token/error in the page's real query string (before the hash
  // route), not inside it, so this reads location.search rather than svelte-spa-router's $querystring.
  const params = new URLSearchParams(location.search)
  const token = params.get('token') ?? ''
  let expired = $state(params.get('error') === 'INVALID_TOKEN' || !token)

  // Drop the token/error from the address bar and history once read, so a raw single-use token
  // doesn't linger there or get revisited (e.g. via back/forward) after it's been consumed.
  if (location.search) history.replaceState(null, '', location.pathname + location.hash)

  let password = $state('')
  let loading = $state(false)
  let error = $state('')

  async function submit() {
    loading = true
    error = ''
    try {
      const { error: err } = await authClient.resetPassword({ newPassword: password, token })
      if (err) {
        if (err.code === 'INVALID_TOKEN') expired = true
        else error = err.status === 429 ? 'Try again in a minute.' : (err.message ?? 'Could not reset the password')
        return
      }
      void push('/login?reset=1')
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
      {#if expired}
        <div class="flex flex-col gap-[10px]">
          <span class="text-[12px] font-semibold uppercase tracking-[0.1em] text-text-dim">Invalid or used token</span>
          <div class="flex flex-col gap-3 p-4 rounded-[10px] bg-surface-inset border border-danger-line">
            <p class="m-0 text-[15px] leading-[1.5] text-danger-text">This link has expired or was already used.</p>
            <a href="#/forgot" class="text-[14px] font-semibold no-underline">Request a new link</a>
          </div>
        </div>
      {:else}
        <form
          onsubmit={e => {
            e.preventDefault()
            void submit()
          }}
          class="flex flex-col gap-5 md:gap-7"
        >
          <h1 class="m-0 font-display font-bold text-[34px] md:text-[44px] xl:text-[48px] uppercase tracking-[0.02em] leading-none">
            New password
          </h1>

          <div class="flex flex-col gap-2">
            <label for="reset-password" class="field-label">New password</label>
            <Input
              id="reset-password"
              type="password"
              bind:value={password}
              autocomplete="new-password"
              placeholder="At least 8 characters"
              minlength={8}
              required
            />
            <PasswordStrength {password} />
          </div>

          {#if error}
            <ErrorText>{error}</ErrorText>
          {/if}

          <Button type="submit" variant="primary" disabled={loading} class="w-full">Save password</Button>
        </form>
      {/if}
    </div>
  </main>
</div>
