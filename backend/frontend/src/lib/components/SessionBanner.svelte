<script lang="ts">
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'

  type ActiveSession = {
    id: string
    gameId: string
    players: { name: string }[]
  }

  let session = $state<ActiveSession | null>(null)

  onMount(async () => {
    try {
      const res = await fetch('/api/sessions')
      if (!res.ok) return
      const d = await res.json()
      const active = (d.sessions ?? []).find((s: any) => s.status === 'active')
      session = active ?? null
    } catch { /* ignore */ }
  })

  const playerNames = $derived(
    session?.players.map(p => p.name).join(', ') ?? ''
  )
</script>

{#if session}
  <div class="flex items-center gap-3 h-11 px-6 flex-shrink-0 border-b border-[#2a3a18]
              bg-[#161d10]">
    <span class="w-[7px] h-[7px] rounded-full bg-accent shrink-0 animate-pulse"></span>
    <span class="text-[13px] text-text-muted shrink-0">Game in progress</span>
    <span class="text-[13px] font-semibold text-text uppercase shrink-0">
      {session.gameId}
    </span>
    <span class="text-[13px] text-text-muted truncate">{playerNames}</span>
    <button type="button" onclick={() => push(`/session/${session!.id}`)}
      class="ml-auto flex items-center gap-[6px] text-[13px] font-semibold text-accent
             bg-transparent border-0 cursor-pointer shrink-0">
      Return to game
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6"/>
      </svg>
    </button>
  </div>
{/if}
