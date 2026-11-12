<script lang="ts">
  // New team (Team-Create): name, tag, colour and the players to invite, with "How others see it"
  // beside the form. Given a team it edits that team's name, tag and colour instead.
  import { X } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import FaceStack from '$lib/components/FaceStack.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { plural } from '$lib/fmt'
  import { createTeam, updateTeam, type Team, type TeamColor } from '$lib/teams/actions'
  import type { PickerPerson } from '$lib/teams/view'
  import { cleanTeamName, cleanTeamTag, isTeamTag, TEAM_COLORS, TEAM_LIMITS, teamNameProblem } from '$shared/teams.js'
  import TeamColorPicker from './TeamColorPicker.svelte'
  import TeamEmblem from './TeamEmblem.svelte'
  import TeamInvitePicker from './TeamInvitePicker.svelte'

  let {
    team = null,
    me,
    onclose,
    onsaved,
  }: {
    /** The team to edit; null makes a new one. */
    team?: Team | null
    /** You, the captain, first in the preview. */
    me: PickerPerson
    onclose: () => void
    onsaved: (teamId: string) => void
  } = $props()

  // The form starts from the team (when editing) and is then the user's
  // svelte-ignore state_referenced_locally
  const form = $state<{ name: string; tag: string; color: TeamColor }>({
    name: team?.name ?? '',
    tag: team?.tag ?? '',
    color: team?.color ?? TEAM_COLORS[3],
  })
  let invite = $state<PickerPerson[]>([])
  let busy = $state(false)
  let error = $state('')

  const cleanName = $derived(cleanTeamName(form.name))
  const nameProblem = $derived(cleanName === '' ? null : teamNameProblem(cleanName))
  const cleanTag = $derived(cleanTeamTag(form.tag))
  const tagProblem = $derived(cleanTag !== '' && !isTeamTag(cleanTag))
  const valid = $derived(cleanName !== '' && nameProblem === null && isTeamTag(cleanTag))
  const roster = $derived(team ? team.members.map(m => m.user) : [me, ...invite])
  const action = $derived(team ? 'Save' : invite.length > 0 ? `Create team & invite ${invite.length}` : 'Create team')

  async function save() {
    if (!valid) return
    busy = true
    const fields = { name: cleanName, tag: cleanTag, color: form.color }
    const result = team
      ? await updateTeam(team.id, fields).then(e => (e ? { error: e } : { id: team.id }))
      : await createTeam(
          fields,
          invite.map(p => p.id),
        )
    busy = false
    if ('error' in result) error = result.error
    else onsaved(result.id)
  }
</script>

<Modal title={team ? 'Edit team' : 'New team'} {onclose} widthClass="md:max-w-[860px]">
  <div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_270px]">
    <div class="flex flex-col gap-[18px]">
      <div class="grid grid-cols-[1fr_120px] gap-3">
        <label class="flex flex-col gap-1.5">
          <span class="field-label">Team name</span>
          <Input bind:value={form.name} maxlength={TEAM_LIMITS.nameMax + 8} aria-invalid={nameProblem !== null} />
          <span class="text-caption {nameProblem ? 'text-live-text' : 'text-text-dim'}">
            {TEAM_LIMITS.nameMin} to {TEAM_LIMITS.nameMax} characters · must be unique
          </span>
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="field-label">Tag</span>
          <Input bind:value={form.tag} maxlength={4} class="font-mono uppercase" aria-invalid={tagProblem} />
          <span class="text-caption {tagProblem ? 'text-live-text' : 'text-text-dim'}">2–4 letters</span>
        </label>
      </div>

      <TeamColorPicker bind:value={form.color} name="team-colour" />

      {#if !team}
        <div class="flex flex-col gap-1.5">
          <span class="field-label">Invite players <span class="font-normal text-text-muted">· friends or by @username</span></span>
          {#if invite.length > 0}
            <ul class="flex flex-wrap gap-2 p-0" aria-label="Players to invite">
              {#each invite as p (p.id)}
                <li class="inline-flex h-9 items-center gap-2 rounded-pill bg-surface-paused pr-1.5 pl-1 text-label">
                  <Avatar name={p.name} face={{ avatar: p.avatar, userId: p.id }} size={28} />{p.name}
                  <button
                    type="button"
                    class="flex text-text-muted hover:text-text"
                    aria-label="Don't invite {p.name}"
                    onclick={() => (invite = invite.filter(i => i.id !== p.id))}><X size={16} /></button
                  >
                </li>
              {/each}
            </ul>
          {/if}
          {#if invite.length < TEAM_LIMITS.maxPlayers - 1}
            <TeamInvitePicker exclude={[me.id, ...invite.map(p => p.id)]} onpick={(p: PickerPerson) => (invite = [...invite, p])} />
          {/if}
        </div>
      {/if}
    </div>

    <aside class="flex flex-col gap-3.5" aria-label="How others see it">
      <span class="type-eyebrow text-text-dim">How others see it</span>
      <div class="flex flex-col items-center gap-2.5 rounded-popover border border-line-2 bg-surface-active p-[18px] text-center">
        <TeamEmblem tag={cleanTag || '?'} color={form.color} size={64} />
        <span class="type-card-title break-all">{cleanName || 'Team name'}</span>
        <span class="text-small text-text-muted">[{cleanTag || '··'}] · {plural(roster.length, 'player')}</span>
        <FaceStack faces={roster.map(u => ({ userId: u.id, name: u.name, guest: false, avatar: u.avatar }))} size={30} />
      </div>
      <ul class="flex flex-col gap-2 pl-4 text-small text-ink-2">
        <li>You’re the captain: you register the team and pick who plays.</li>
        <li>{TEAM_LIMITS.minPlayers} to {TEAM_LIMITS.maxPlayers} players. Invites expire after {TEAM_LIMITS.inviteDays} days.</li>
        <li>You can be in up to {TEAM_LIMITS.teamsPerPlayer} teams.</li>
      </ul>
    </aside>
  </div>
  {#if error}<ErrorText>{error}</ErrorText>{/if}

  {#snippet footer()}
    <Button variant="ghost" onclick={onclose}>Cancel</Button>
    <Button variant="accent" disabled={!valid || busy} onclick={() => void save()}>{action}</Button>
  {/snippet}
</Modal>
