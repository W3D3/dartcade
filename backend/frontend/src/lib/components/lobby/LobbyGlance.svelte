<script lang="ts">
  // What a lobby is about before you join it (an invite, an invite link): its next game, who's
  // in, its boards.
  import { MonitorSmartphone, Target, Users } from '@lucide/svelte'
  import type { Face, NextGame } from '$lib/api/lobby-ws'
  import FaceStack from '$lib/components/FaceStack.svelte'
  import { gameModes } from '$lib/gameModes'
  import { nextGameLine, peopleNames } from '$lib/lobby/format'

  let {
    glance,
    class: className = '',
  }: { glance: { peopleCount: number; faces: Face[]; nextGame: NextGame | null; boardNames: string[] }; class?: string } = $props()

  const defaults = $derived($gameModes.find(g => g.id === glance.nextGame?.gameId)?.defaultConfig)
</script>

<dl class="m-0 px-[14px] py-2 rounded-[12px] border border-line flex flex-col gap-[2px] {className}">
  <div class="row">
    <Target size={16} class="text-text-dim" aria-hidden="true" />
    <dt>Next game</dt>
    <dd><span class="truncate">{nextGameLine(glance.nextGame, defaults)}</span></dd>
  </div>
  <div class="row">
    <Users size={16} class="text-text-dim" aria-hidden="true" />
    <dt>In the lobby</dt>
    <dd><FaceStack faces={glance.faces} size={24} /><span class="truncate">{peopleNames(glance)}</span></dd>
  </div>
  {#if glance.boardNames.length > 0}
    <div class="row">
      <MonitorSmartphone size={16} class="text-text-dim" aria-hidden="true" />
      <dt>Boards</dt>
      <dd><span class="truncate">{glance.boardNames.join(', ')}</span></dd>
    </div>
  {/if}
</dl>

<style>
  .row {
    display: grid;
    grid-template-columns: 18px 88px 1fr;
    align-items: center;
    gap: 10px;
    min-height: 30px;
  }
  dt {
    font-size: 13px;
    color: var(--color-text-dim);
  }
  dd {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 14px;
    color: var(--color-text);
  }
</style>
