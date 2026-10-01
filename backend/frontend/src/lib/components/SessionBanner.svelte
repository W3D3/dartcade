<script lang="ts">
  import { ArrowRight } from '@lucide/svelte'
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { api, type SessionSummary } from '$lib/api'

  let session = $state<SessionSummary | null>(null)

  onMount(async () => {
    try {
      const { data } = await api.GET('/api/sessions')
      session = data?.sessions.find(s => s.status === 'active') ?? null
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
    <button type="button" onclick={() => { if (session) void push(`/session/${session.id}`) }}
      class="ml-auto flex items-center gap-[6px] text-[13px] font-semibold text-accent
             bg-transparent border-0 cursor-pointer shrink-0">
      Return to game
      <ArrowRight size={14} strokeWidth={2.5} />
    </button>
  </div>
{/if}
