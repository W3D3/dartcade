<!--
  Play on a mission: alone, or with the lobby the user hosts (everyone who plays there takes turns on
  it). The game is played on the player's board, or entered by hand without one (the game header's
  Enter view switches any time). Starts it through POST /api/missions/{id}/start and opens the game.
-->
<script lang="ts">
  import { push } from 'svelte-spa-router'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js'
  import { me } from '$lib/lobby/sockets'
  import { startMission } from '$lib/missions/api'
  import type { MissionCard } from '$lib/missions/view'
  import { plural } from '$lib/fmt'
  import { hrefs } from '$lib/routes'

  let { card, onclose }: { card: MissionCard; onclose: () => void } = $props()

  // Only a lobby the user hosts can start it for everyone
  const lobby = $derived($me?.lobby?.youHost ? $me.lobby : null)
  let who = $state<'alone' | 'lobby'>('alone')
  let starting = $state(false)
  let error = $state('')

  async function start(): Promise<void> {
    starting = true
    error = ''
    const res = await startMission(card.id, who === 'lobby' && lobby ? lobby.id : null)
    starting = false
    if ('error' in res) error = res.error
    else void push(`/session/${res.ok}`)
  }
</script>

<Modal
  title="Play {card.mission.name}"
  subtitle="Players take turns, one visit each. Your clock runs only in your turn."
  {onclose}
  widthClass="max-w-[440px]"
>
  <RadioGroup bind:value={who} class="flex flex-col gap-2" aria-label="Who plays">
    <RadioGroupItem value="alone" variant="course">
      <span class="text-body font-semibold">Alone</span>
      <span class="text-small text-text-muted">On your board, or entered by hand without one</span>
    </RadioGroupItem>
    <RadioGroupItem value="lobby" variant="course" disabled={!lobby} class="disabled:opacity-60">
      <span class="text-body font-semibold">With your lobby{lobby ? ` · ${lobby.name}` : ''}</span>
      <span class="text-small text-text-muted"
        >{lobby
          ? `${plural(lobby.peopleCount, 'person', 'people')} take turns on their own boards`
          : 'Host a lobby and invite friends first'}</span
      >
    </RadioGroupItem>
  </RadioGroup>
  {#if !lobby}
    <p class="text-small text-text-muted">
      To play with friends, <a href={hrefs.lobby()}>open your lobby</a> and invite them, then start the mission here.
    </p>
  {/if}
  {#if error}<ErrorText>{error}</ErrorText>{/if}
  {#snippet footer()}
    <Button variant="outline" size="lg" class="flex-1" onclick={onclose}>Cancel</Button>
    <Button variant="accent" size="lg" class="flex-1" disabled={starting} onclick={() => void start()}
      >{starting ? 'Starting…' : 'Start'}</Button
    >
  {/snippet}
</Modal>
