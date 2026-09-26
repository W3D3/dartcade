<script lang="ts">
  import { push } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'

  let mode: 'login' | 'register' = 'login'
  let email = ''
  let password = ''
  let name = ''
  let error = ''
  let loading = false

  async function submit() {
    loading = true
    error = ''
    try {
      const url = mode === 'login'
        ? '/api/auth/sign-in/email'
        : '/api/auth/sign-up/email'
      const body = mode === 'login'
        ? { email, password }
        : { email, password, name }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        error = data.message ?? 'Invalid credentials'
        return
      }
      push('/')
    } finally {
      loading = false
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center" style="background: #0b1628;">
  <div class="w-full max-w-sm px-6">

    <!-- Logo -->
    <div class="flex flex-col items-center mb-8 gap-3">
      <div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
        style="background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3)">
        🎯
      </div>
      <h1 class="text-2xl font-bold tracking-tight" style="color: #f1f5f9;">Dartcade</h1>
    </div>

    <!-- Card -->
    <div class="rounded-2xl p-6 space-y-5"
      style="background: #111d2e; border: 1px solid rgba(255,255,255,0.07);">

      <!-- Tab toggle -->
      <div class="flex rounded-xl overflow-hidden" style="background: rgba(255,255,255,0.04);">
        <button
          class="flex-1 py-2 text-sm font-medium transition-colors rounded-lg"
          style={mode === 'login'
            ? 'background: #3b82f6; color: white;'
            : 'color: #64748b;'}
          on:click={() => { mode = 'login'; error = '' }}
        >Sign in</button>
        <button
          class="flex-1 py-2 text-sm font-medium transition-colors rounded-lg"
          style={mode === 'register'
            ? 'background: #3b82f6; color: white;'
            : 'color: #64748b;'}
          on:click={() => { mode = 'register'; error = '' }}
        >Register</button>
      </div>

      <!-- Form -->
      <form on:submit|preventDefault={submit} class="space-y-3">
        {#if mode === 'register'}
          <Input
            bind:value={name}
            placeholder="Display name"
            required
            class="bg-[#0b1628] border-white/10 text-white placeholder:text-gray-600 focus:border-blue-500"
          />
        {/if}
        <Input
          bind:value={email}
          type="email"
          placeholder="Email"
          required
          class="bg-[#0b1628] border-white/10 text-white placeholder:text-gray-600 focus:border-blue-500"
        />
        <Input
          bind:value={password}
          type="password"
          placeholder="Password"
          required
          class="bg-[#0b1628] border-white/10 text-white placeholder:text-gray-600 focus:border-blue-500"
        />
        {#if error}
          <p class="text-red-400 text-sm">{error}</p>
        {/if}
        <Button
          type="submit"
          disabled={loading}
          class="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold"
        >
          {loading ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
      </form>
    </div>
  </div>
</div>
