<script lang="ts">
  import { push } from 'svelte-spa-router'

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

<div class="min-h-screen flex items-center justify-center bg-gray-950">
  <div class="bg-gray-900 rounded-xl p-8 w-full max-w-sm space-y-6">
    <h1 class="text-2xl font-bold text-white text-center">Dartcade</h1>

    <div class="flex rounded-lg overflow-hidden border border-gray-700">
      <button
        class="flex-1 py-2 text-sm font-medium transition-colors
               {mode === 'login' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'}"
        on:click={() => { mode = 'login'; error = '' }}
      >Sign in</button>
      <button
        class="flex-1 py-2 text-sm font-medium transition-colors
               {mode === 'register' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'}"
        on:click={() => { mode = 'register'; error = '' }}
      >Register</button>
    </div>

    <form on:submit|preventDefault={submit} class="space-y-4">
      {#if mode === 'register'}
        <input bind:value={name} placeholder="Display name"
          class="w-full bg-gray-800 text-white rounded-lg px-4 py-2 border border-gray-700 focus:outline-none focus:border-orange-500"
          required />
      {/if}
      <input bind:value={email} type="email" placeholder="Email"
        class="w-full bg-gray-800 text-white rounded-lg px-4 py-2 border border-gray-700 focus:outline-none focus:border-orange-500"
        required />
      <input bind:value={password} type="password" placeholder="Password"
        class="w-full bg-gray-800 text-white rounded-lg px-4 py-2 border border-gray-700 focus:outline-none focus:border-orange-500"
        required />
      {#if error}
        <p class="text-red-400 text-sm">{error}</p>
      {/if}
      <button type="submit" disabled={loading}
        class="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-colors">
        {loading ? '...' : mode === 'login' ? 'Sign in' : 'Create account'}
      </button>
    </form>
  </div>
</div>
