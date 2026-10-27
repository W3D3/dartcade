<script lang="ts">
  // The blue Start / Stop big screen button and its hint, in the board popover and the board details.
  import { LoaderCircle, MonitorPlay } from '@lucide/svelte'
  import { onDestroy } from 'svelte'
  import { api, type Board } from '$lib/api'
  import { bigScreenButton, bigScreenError } from '$lib/boards'
  import { flag } from '$lib/flags'
  import { createToast } from '$lib/toast'
  import { Toast } from '$lib/components/ui/toast/index.js'

  // `board` follows the server (its screen refetches on the /ws/me push), so the label changes when
  // the bridge reports back, not on click
  let { board, blocked = false }: { board: Board; blocked?: boolean } = $props()

  const flagOn = flag('bigscreen.enabled')
  const failure = createToast<string>(6000)
  onDestroy(failure.dismiss)
  const button = $derived(bigScreenButton(board, $flagOn))
  // Spins from the click until the board reports the screen up (or down), not just until the request returns
  const SETTLE_MS = 30_000
  let busy = $state(false)
  let waitingFor = $state<boolean | null>(null)
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => clearTimeout(settleTimer))
  $effect(() => {
    if (waitingFor !== null && board.bigScreen.running === waitingFor) settled()
  })

  function settled() {
    waitingFor = null
    clearTimeout(settleTimer)
  }

  async function toggle() {
    const action = button.action
    if (!action) return
    busy = true
    try {
      const res = await api.POST(`/api/boards/{id}/big-screen/${action}`, { params: { path: { id: board.id } } })
      if (res.data) {
        waitingFor = action === 'start'
        settleTimer = setTimeout(() => {
          if (waitingFor !== null) failure.show("The bridge's computer did not answer. Is its screen on and its helper running?")
          settled()
        }, SETTLE_MS)
      } else failure.show(bigScreenError(res.response.status, res.error.error))
    } catch {
      failure.show(bigScreenError(undefined))
    } finally {
      busy = false
    }
  }
</script>

{#if button.action}
  <button
    type="button"
    onclick={toggle}
    disabled={busy || waitingFor !== null || blocked || button.disabled}
    class="flex items-center justify-center gap-[6px] w-full h-9 rounded-[8px] text-[13px] font-semibold
           border border-transparent bg-big-screen text-white cursor-pointer font-[inherit] transition-colors
           hover:bg-big-screen-hover disabled:opacity-35 disabled:cursor-not-allowed"
  >
    {#if busy || waitingFor !== null}
      <LoaderCircle size={13} class="animate-spin" />
    {:else}
      <MonitorPlay size={13} />
    {/if}
    {button.label}
  </button>
  {#if button.hint}<p class="m-0 text-[12px] text-text-dim">{button.hint}</p>{/if}
{/if}

{#if $failure}
  <Toast tone="error" onclose={failure.dismiss}>{$failure.value}</Toast>
{/if}
