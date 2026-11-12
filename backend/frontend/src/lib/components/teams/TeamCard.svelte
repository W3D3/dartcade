<script lang="ts">
  // One of your teams in the Teams tab's list: emblem, name, who captains it, the players and its
  // record. Picking it shows it on the right.
  import FaceStack from '$lib/components/FaceStack.svelte'
  import { plural } from '$lib/fmt'
  import type { Team } from '$lib/teams/actions'
  import { captainLine, recordText } from '$lib/teams/view'
  import TeamEmblem from './TeamEmblem.svelte'

  let { team, myId, selected, onselect }: { team: Team; myId: string; selected: boolean; onselect: () => void } = $props()
</script>

<button
  type="button"
  aria-pressed={selected}
  onclick={onselect}
  class="flex w-full flex-col gap-[14px] rounded-popover p-[18px] text-left
         {selected
    ? 'border-[1.5px] border-accent-line-strong bg-card-active'
    : 'border border-line bg-surface-panel hover:bg-surface-row'}"
>
  <span class="flex items-center gap-[14px] min-w-0">
    <TeamEmblem tag={team.tag} color={team.color} />
    <span class="flex min-w-0 flex-col gap-[3px]">
      <span class="type-section-title truncate leading-none">{team.name}</span>
      <span class="text-small text-text-muted">{captainLine(team, myId)}</span>
    </span>
  </span>
  <span class="flex items-center gap-2.5">
    <FaceStack faces={team.members.map(m => ({ userId: m.user.id, name: m.user.name, guest: false, avatar: m.user.avatar }))} size={28} />
    <span class="text-small text-text-muted">{plural(team.members.length, 'player')}</span>
    <span class="ml-auto font-display text-lead font-bold leading-none" aria-label="{team.record.wins} won, {team.record.losses} lost"
      >{recordText(team)}</span
    >
  </span>
</button>
