<script lang="ts">
  // A member's next-game card (Lobby-Phone): the host's pick, "I'm in" or sitting this one out, and Ready.
  import { Check } from '@lucide/svelte'
  import type { Lobby, LobbyPerson } from '$lib/api/lobby-ws'
  import { Button } from '$lib/components/ui/button/index.js'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import NextGameSummary from './NextGameSummary.svelte'
  import ReadyCount from './ReadyCount.svelte'
  import { hostName as hostNameOf, type PersonPatch } from '$lib/lobby/rules'

  let { lobby, me, onupdate }: {
    lobby: Lobby
    me: LobbyPerson
    onupdate: (personId: string, patch: PersonPatch) => Promise<boolean>
  } = $props()

  const PLAYS = [{ value: true, label: "I'm in" }, { value: false, label: 'Sitting this one out' }]
  const hostName = $derived(hostNameOf(lobby) ?? 'The host')
</script>

<section aria-label="Next game" class="p-[14px] md:p-5 rounded-[14px] bg-surface-active border-2 border-accent flex flex-col gap-[10px]">
  <NextGameSummary game={lobby.nextGame} pickedBy="{hostName}'s pick" size="sm" />
  <SegmentedControl options={PLAYS} value={me.plays} onchange={(v) => { if (v !== me.plays) void onupdate(me.id, { plays: v === true }) }} />
  {#if !me.plays}
    <Button variant="ghost" disabled class="h-12 border-dashed">Ready · not needed this game</Button>
  {:else if me.ready}
    <Button variant="accent" class="h-12" aria-pressed="true" onclick={() => void onupdate(me.id, { ready: false })}>
      <Check size={18} strokeWidth={3} />Ready
    </Button>
  {:else}
    <Button variant="outline" class="h-12 border-2 border-accent text-accent text-[15px] font-bold" aria-pressed="false"
      onclick={() => void onupdate(me.id, { ready: true })}>I'm ready</Button>
  {/if}
  <div class="flex justify-between gap-[10px] text-[13px]">
    <span><ReadyCount {lobby} suffix="{hostName} starts" /></span>
    <span class="text-text-dim">Ready resets after each game</span>
  </div>
</section>
