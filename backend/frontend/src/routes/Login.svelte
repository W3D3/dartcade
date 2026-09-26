<script lang="ts">
  import { push } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import AuthPanel from '$lib/components/AuthPanel.svelte'

  let email = $state('')
  let password = $state('')
  let keepSignedIn = $state(true)
  let error = $state('')
  let loading = $state(false)

  const devEmail = import.meta.env.VITE_DEV_EMAIL ?? 'admin@dartcade.local'
  const devPassword = import.meta.env.VITE_DEV_PASSWORD ?? 'admin1234'

  async function submit() {
    loading = true
    error = ''
    try {
      const res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        error = d.message ?? 'Invalid credentials'
        return
      }
      push('/')
    } finally {
      loading = false
    }
  }

  async function devLogin() {
    email = devEmail
    password = devPassword
    await submit()
  }
</script>

<div class="flex min-h-screen bg-bg">
  <AuthPanel />

  <main class="flex flex-grow items-center justify-center">
    <form onsubmit={(e) => { e.preventDefault(); submit() }} class="flex w-[400px] flex-col gap-7">

      <div class="flex flex-col gap-2">
        <h1 class="m-0 font-display font-bold text-[48px] uppercase tracking-[0.02em] leading-none">
          Sign in
        </h1>
        <p class="m-0 text-[16px] text-text-muted">Welcome back. Your boards are waiting.</p>
      </div>

      <div class="flex flex-col gap-[18px]">
        <div class="flex flex-col gap-2">
          <label for="login-email" class="text-[14px] font-medium text-[#d8d8ce]">Email</label>
          <Input id="login-email" type="email" bind:value={email} autocomplete="email"
            placeholder="you@example.com" required />
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex justify-between items-baseline">
            <label for="login-password" class="text-[14px] font-medium text-[#d8d8ce]">Password</label>
            <a href="#/forgot" class="text-[14px] no-underline">Forgot password?</a>
          </div>
          <Input id="login-password" type="password" bind:value={password}
            autocomplete="current-password" placeholder="••••••••" required />
        </div>

        <label class="flex items-center gap-[10px] text-[15px] text-[#c9c9bf] min-h-[44px] cursor-pointer">
          <input type="checkbox" bind:checked={keepSignedIn}
            class="w-[18px] h-[18px] m-0 accent-accent" />
          Keep me signed in on this device
        </label>
      </div>

      {#if error}
        <p class="m-0 text-[14px] text-live-text">{error}</p>
      {/if}

      <div class="flex flex-col gap-3">
        <Button type="submit" variant="primary" disabled={loading} class="w-full">
          {loading ? '…' : 'Sign in'}
        </Button>

        {#if import.meta.env.DEV}
          <Button type="button" variant="ghost" onclick={devLogin} class="w-full text-text-dim">
            Dev: sign in as admin
          </Button>
        {/if}
      </div>

      <p class="m-0 text-[15px] text-text-muted text-center">
        New to Dartcade?
        <a href="#/register" class="font-semibold no-underline">Create an account</a>
      </p>
    </form>
  </main>
</div>
