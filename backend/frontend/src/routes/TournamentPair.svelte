<script lang="ts">
  // A venue device opens its one-time code (`#/tournament-mode/pair/<code>`, or without the code to
  // type it): it becomes a device session for that tournament, is named, and shows tournament
  // mode. No account, no nav; the server decides what the session may do.
  import { onMount } from 'svelte'
  import { Trophy } from '@lucide/svelte'
  import { push } from 'svelte-spa-router'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { hrefs } from '$lib/routes'
  import { loadDeviceSession, pairDevice } from '$lib/tournaments/devices'

  let { params = {} }: { params?: { code?: string } } = $props()

  let code = $state('')
  let error = $state<string | null>(null)
  let busy = $state(false)

  async function pair(typed: string) {
    busy = true
    const r = await pairDevice(typed.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    busy = false
    if (!('error' in r)) return void push(hrefs.tournamentMode(r.tournamentId).slice(1))
    // A link that was already opened on this device (a reload): it is paired, carry on
    const held = await loadDeviceSession()
    if (held) void push(hrefs.tournamentMode(held.tournamentId).slice(1))
    else error = r.error
  }

  onMount(() => {
    if (params.code) void pair(params.code)
  })
</script>

<main class="grid h-dvh place-items-center bg-bg p-6 text-text">
  <form
    class="card flex w-full max-w-sm flex-col gap-4 p-6"
    onsubmit={e => {
      e.preventDefault()
      void pair(code)
    }}
  >
    <Trophy size={28} class="text-accent" aria-hidden="true" />
    <h1 class="type-section-title font-bold">Join a tournament</h1>
    <p class="text-label text-text-muted">
      {params.code && busy
        ? 'Pairing this device…'
        : 'Enter the code an organizer showed you. This device then keeps score for that tournament only.'}
    </p>
    {#if !params.code || error}
      <label class="flex flex-col gap-1.5">
        <span class="field-label">Pairing code</span>
        <Input bind:value={code} autocomplete="off" autocapitalize="characters" maxlength={9} class="font-mono tracking-widest" autofocus />
      </label>
    {/if}
    {#if error}<ErrorText>{error}</ErrorText>{/if}
    {#if !params.code || error}
      <Button variant="accent" type="submit" disabled={busy || code.replace(/[^A-Za-z0-9]/g, '').length < 8}>Pair this device</Button>
    {/if}
  </form>
</main>
