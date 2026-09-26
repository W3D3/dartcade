<script lang="ts">
  import { push } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import AuthPanel from '$lib/components/AuthPanel.svelte'

  let name = $state('')
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
    if (!acceptTerms) { error = 'Please accept the terms'; return }
    loading = true; error = ''
    try {
      const res = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        error = d.message ?? 'Registration failed'
        return
      }
      push('/')
    } finally {
      loading = false
    }
  }
</script>

<div class="flex min-h-screen bg-bg">
  <AuthPanel />

  <main class="flex flex-grow items-center justify-center">
    <form onsubmit={(e) => { e.preventDefault(); submit() }} class="flex w-[400px] flex-col gap-7">

      <div class="flex flex-col gap-2">
        <p class="m-0 font-mono text-[13px] tracking-[0.08em] text-accent">Step 1 of 2</p>
        <h1 class="m-0 font-display font-bold text-[48px] uppercase tracking-[0.02em] leading-none">
          Create account
        </h1>
        <p class="m-0 text-[16px] text-text-muted">Your player name will show in game.</p>
      </div>

      <div class="flex flex-col gap-[18px]">
        <div class="flex flex-col gap-2">
          <label for="reg-name" class="text-[14px] font-medium text-[#d8d8ce]">Player name</label>
          <Input id="reg-name" bind:value={name} placeholder="e.g. Phil Taylor" required />
        </div>
        <div class="flex flex-col gap-2">
          <label for="reg-email" class="text-[14px] font-medium text-[#d8d8ce]">Email</label>
          <Input id="reg-email" type="email" bind:value={email} autocomplete="email"
            placeholder="you@example.com" required />
        </div>
        <div class="flex flex-col gap-2">
          <label for="reg-password" class="text-[14px] font-medium text-[#d8d8ce]">Password</label>
          <Input id="reg-password" type="password" bind:value={password}
            autocomplete="new-password" placeholder="At least 8 characters" required />
          {#if password}
            <div class="flex gap-1 mt-1">
              {#each [1,2,3,4] as lvl}
                <div class="h-1 flex-1 rounded-full transition-colors"
                  style:background={lvl <= strength ? strengthColors[strength] : '#2e322b'}>
                </div>
              {/each}
            </div>
            <p class="m-0 text-[13px]" style:color={strengthColors[strength]}>
              {strengthLabels[strength]}
            </p>
          {/if}
        </div>
        <label class="flex items-center gap-[10px] text-[15px] text-[#c9c9bf] min-h-[44px] cursor-pointer">
          <input type="checkbox" bind:checked={acceptTerms}
            class="w-[18px] h-[18px] m-0 accent-accent" />
          I agree to the <a href="#/terms" class="font-semibold">terms of service</a>
        </label>
      </div>

      {#if error}
        <p class="m-0 text-[14px] text-live-text">{error}</p>
      {/if}

      <Button type="submit" variant="primary" disabled={loading || !acceptTerms} class="w-full">
        {loading ? '…' : 'Create account'}
      </Button>

      <p class="m-0 text-[15px] text-text-muted text-center">
        Already have an account?
        <a href="#/login" class="font-semibold no-underline">Sign in</a>
      </p>
    </form>
  </main>
</div>
