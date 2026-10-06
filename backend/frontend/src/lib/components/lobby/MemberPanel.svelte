<script lang="ts">
  // A member's next-game card (Lobby-Phone): the host's pick, "I'm in" or sitting this one out,
  // Ready, and the game's settings exactly as the host set them (read-only: a Settings toggle
  // opens the same panel the host's card has, sized from the lobby snapshot, not local state).
  import { Check } from '@lucide/svelte'
  import type { Lobby, LobbyPerson } from '$lib/api/lobby-ws'
  import { Button } from '$lib/components/ui/button/index.js'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import NextGameSettingsPanel from './NextGameSettingsPanel.svelte'
  import NextGameSummary from './NextGameSummary.svelte'
  import ReadyCount from './ReadyCount.svelte'
  import SettingsToggleButton from './SettingsToggleButton.svelte'
  import TeamsPanel from './TeamsPanel.svelte'
  import ThrowOrderField from './ThrowOrderField.svelte'
  import { gameModes, withDefaults } from '$lib/gameModes'
  import { isTeamFormat, type PersonPatch } from '$lib/lobby/rules'

  let {
    lobby,
    me,
    onupdate,
  }: {
    lobby: Lobby
    me: LobbyPerson
    onupdate: (personId: string, patch: PersonPatch) => Promise<boolean>
  } = $props()

  const PLAYS = [
    { value: true, label: "I'm in" },
    { value: false, label: 'Sitting this one out' },
  ]
  const hostName = $derived(lobby.hostName ?? 'The host')

  const game = $derived(lobby.nextGame)
  const info = $derived(game ? $gameModes.find(g => g.id === game.gameId) : undefined)
  const defaults = $derived(info?.defaultConfig ?? {})
  const config = $derived(game ? withDefaults(game.config, defaults) : {})
  const teamGame = $derived(isTeamFormat(info?.teams, config))
  const hasBot = $derived(lobby.people.some(p => p.bot !== null))
  let settingsOpen = $state(false)
</script>

<section aria-label="Next game" class="p-[14px] md:p-5 rounded-[14px] bg-surface-active border-2 border-accent flex flex-col gap-[10px]">
  <NextGameSummary {lobby} pickedBy="{hostName}'s pick" size="sm" />
  {#if game}
    <SettingsToggleButton open={settingsOpen} ontoggle={() => (settingsOpen = !settingsOpen)} />
    <NextGameSettingsPanel
      open={settingsOpen}
      gameId={game.gameId}
      {config}
      {defaults}
      meta={info?.configMeta ?? {}}
      teams={info?.teams ?? false}
      {hasBot}
      readonly
    >
      <ThrowOrderField {lobby} gameId={game.gameId} readonly />
    </NextGameSettingsPanel>
  {/if}
  {#if teamGame}
    <TeamsPanel {lobby} editable={false} />
  {/if}
  <SegmentedControl
    options={PLAYS}
    value={me.plays}
    onchange={v => {
      if (v !== me.plays) void onupdate(me.id, { plays: v === true })
    }}
  />
  {#if !me.plays}
    <Button variant="ghost" size="lg" disabled class="border-dashed">Ready · not needed this game</Button>
  {:else if me.ready}
    <Button variant="accent" size="lg" aria-pressed="true" onclick={() => void onupdate(me.id, { ready: false })}>
      <Check size={18} strokeWidth={3} />Ready
    </Button>
  {:else}
    <Button variant="accent-outline" size="lg" aria-pressed="false" onclick={() => void onupdate(me.id, { ready: true })}>I'm ready</Button>
  {/if}
  <div class="flex justify-between gap-[10px] text-[13px]">
    <span><ReadyCount {lobby} suffix="{hostName} starts" /></span>
    <span class="text-text-dim">Ready resets after each game</span>
  </div>
</section>
