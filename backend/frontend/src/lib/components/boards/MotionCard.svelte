<script lang="ts">
  // Diagnostics: the live motion state the board's bridge reports (stable, waiting, dart, hand, takeout).
  // Collapsed by default; polls only while open and the board is online.
  import { api, type Board } from '$lib/api'
  import { Stethoscope } from '@lucide/svelte'
  import SectionCard from './SectionCard.svelte'
  import { motionLabel, motionSince, type Motion } from '$lib/motion'

  let { board }: { board: Board } = $props()

  let open = $state(false)
  let motion = $state<Motion>(null)
  let now = $state(Date.now())

  const boardId = $derived(board.id)
  const online = $derived(board.online)

  $effect(() => {
    if (!open || !online) {
      motion = null
      return
    }
    const id = boardId
    let cancelled = false
    const load = async () => {
      const { data } = await api.GET('/api/boards/{id}/motion', { params: { path: { id } } }).catch(() => ({ data: undefined }))
      if (cancelled) return
      motion = data?.motion ?? null
      now = Date.now()
    }
    void load()
    const interval = setInterval(() => void load(), 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  })
</script>

<SectionCard title="Diagnostics" icon={Stethoscope}>
  {#snippet aside()}
    <button
      type="button"
      aria-expanded={open}
      onclick={() => (open = !open)}
      class="h-11 px-3 rounded-md text-sm font-semibold border border-line-3 cursor-pointer text-text hover:bg-surface-active"
    >
      {open ? 'Hide' : 'Show'}
    </button>
  {/snippet}
  {#if open}
    <div class="flex items-center gap-3" data-testid="motion-state">
      <span class="text-sm text-text-muted">Motion</span>
      <span class="px-3 py-1 rounded-chip border border-line-3 text-sm font-semibold {motion ? 'text-text' : 'text-text-muted'}">
        {online ? motionLabel(motion) : 'Offline'}
      </span>
      {#if motion}<span class="text-sm text-text-muted">{motionSince(motion, now)}</span>{/if}
    </div>
    <p class="text-sm leading-[1.45] text-text-muted">
      What the board's motion detection sees right now. Unknown means the bridge is too old to report it.
    </p>
  {:else}
    <p class="text-sm leading-[1.45] text-text-muted">Live motion state of the board, for troubleshooting.</p>
  {/if}
</SectionCard>
