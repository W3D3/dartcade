<script lang="ts">
  // The tournament bar over a match played in tournament mode (Tournament-Mode-Match): which
  // tournament and match this is, this device, and the way back to the matches.
  import { onMount } from 'svelte'
  import { ArrowLeft, MonitorSmartphone, TabletSmartphone } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import type { Tournament } from '$lib/api'
  import { loadTournament } from '$lib/tournaments/browse'
  import type { LiveMessage } from '$lib/tournaments/live'
  import { deviceName, matchLabel, type ModeSession } from '$lib/tournaments/mode'
  import { push } from 'svelte-spa-router'
  import { hrefs } from '$lib/routes'

  let { mode, sessionId }: { mode: ModeSession; sessionId: string } = $props()

  let m = $state<LiveMessage | null>(null)
  let name = $state('')
  let format = $state<Tournament['format']>('single_elimination')
  onMount(() => {
    void loadTournament(mode.tournamentId).then(r => {
      if ('tournament' in r) {
        name = r.tournament.name
        format = r.tournament.format
      }
    })
    return mode.live.message.subscribe(v => (m = v))
  })
  const match = $derived(m?.matches.find(x => x.game?.sessionId === sessionId))
  const line = $derived.by(() => {
    if (!m || !match) return ''
    const side = (i: 0 | 1) => m?.entries.find(e => e.id === match.sides[i])?.name ?? '?'
    return `${matchLabel(m, format, match)} · ${side(0)} vs ${side(1)}`
  })
</script>

<header class="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-2 bg-surface-1 px-4 py-1.5 md:px-6">
  <span class="inline-flex h-6 items-center gap-1.5 rounded-pill bg-accent px-2.5 text-caption font-extrabold tracking-wider text-bg">
    <MonitorSmartphone size={13} aria-hidden="true" />TOURNAMENT MODE
  </span>
  <span class="min-w-0 grow basis-40 truncate text-label font-semibold">{name}{line ? ` · ${line}` : ''}</span>
  {#if deviceName()}
    <span class="inline-flex items-center gap-1.5 text-small text-text-muted"
      ><TabletSmartphone size={14} aria-hidden="true" />{deviceName()}</span
    >
  {/if}
  <Button variant="outline" size="sm" onclick={() => void push(hrefs.tournamentMode(mode.tournamentId).slice(1))}>
    <ArrowLeft size={14} aria-hidden="true" />Matches
  </Button>
</header>
