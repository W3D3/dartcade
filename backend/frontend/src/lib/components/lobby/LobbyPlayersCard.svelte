<script lang="ts">
  // The Play page inside a lobby (Play, Mobile-Play): the lobby's players instead of the
  // player list. Manage opens the lobby.
  import type { Lobby } from '$lib/api/lobby-ws'
  import Avatar from './Avatar.svelte'
  import { counts } from '$lib/lobby/rules'

  let { lobby }: { lobby: Lobby } = $props()
  const ORDER: Record<Lobby['throwOrder'], string> = { lobby: 'lobby order', random: 'random order', bulloff: 'bull-off decides' }
  const c = $derived(counts(lobby))
  const playing = $derived(lobby.people.filter(p => p.plays))
  const out = $derived(lobby.people.filter(p => !p.plays).map(p => p.name))
  const line = $derived([
    ...(out.length ? [`${out.join(', ')} ${out.length === 1 ? 'sits' : 'sit'} out`] : []),
    ORDER[lobby.throwOrder],
  ].join(' · '))
</script>

<div class="flex flex-col gap-2 pt-[18px] border-t border-line">
  <div class="flex justify-between items-baseline">
    <span class="text-[14px] font-medium text-ink-soft">Players</span>
    <span class="text-[12px] text-text-dim">From your lobby</span>
  </div>
  <a href="#/lobby" class="flex items-center gap-[10px] min-h-[58px] px-3 rounded-[10px] bg-surface-active border border-accent-line text-text no-underline">
    <span class="flex items-center pl-[6px] shrink-0">
      {#each playing.slice(0, 4) as p (p.id)}
        <span class="-ml-[6px] rounded-full ring-2 ring-surface-active"><Avatar name={p.name} guest={p.userId === null} size={30} /></span>
      {/each}
    </span>
    <span class="flex flex-col gap-px min-w-0 flex-grow">
      <span class="text-[14px] font-semibold truncate">{lobby.name} · {c.playing} playing</span>
      <span class="text-[12px] text-text-muted truncate">{line}</span>
    </span>
    <span class="text-[13px] font-semibold text-accent shrink-0">Manage</span>
  </a>
</div>
