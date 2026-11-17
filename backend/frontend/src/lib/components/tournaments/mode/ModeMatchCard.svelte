<script lang="ts">
  // One match on tournament mode's Matches tab (Tournament-Mode): ready (Play), up next (who it
  // waits for), playing now (LIVE on a device, or PAUSED with Continue) and finished (FORFEIT for
  // a walkover).
  import { Play, StepForward } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import type { Tournament } from '$lib/api'
  import { faceOf, type Device, type LiveMatch, type LiveMessage } from '$lib/tournaments/live'
  import { clock, feederOf, matchLabel, playedOn, scoreLine } from '$lib/tournaments/mode'

  let {
    m,
    match,
    format,
    gameId,
    devices,
    deviceId,
    oncontinue,
    onplay,
  }: {
    m: LiveMessage
    match: LiveMatch
    format: Tournament['format']
    gameId: string
    devices: readonly Device[]
    /** This device's own id: its match opens rather than continues. */
    deviceId: string | null
    oncontinue: (match: LiveMatch) => void
    /** Play on a ready match: pick the board and start it. */
    onplay: (match: LiveMatch) => void
  } = $props()

  const label = $derived(matchLabel(m, format, match))
  const finished = $derived(match.status === 'finished')
  const live = $derived(match.status === 'live')
  const device = $derived(live ? playedOn(match, devices) : null)
  const mine = $derived(device !== null && device.id === deviceId)
  const sides = $derived(
    ([0, 1] as const).map(i => {
      const entry = m.entries.find(e => e.id === match.sides[i]) ?? null
      const feeder = entry ? null : feederOf(m, match, i)
      return {
        entry,
        name: entry?.name ?? (feeder ? `Winner of ${matchLabel(m, format, feeder)}` : 'To be decided'),
        feeder,
        won: finished && match.winner === i,
        lost: finished && match.winner !== null && match.winner !== i,
      }
    }),
  )
  const waiting = $derived(
    sides
      .flatMap(s => (s.feeder && s.feeder.status !== 'finished' ? [matchLabel(m, format, s.feeder)] : []))
      .map(l => `Waiting for ${l}`)
      .join(' · '),
  )
  const walkover = $derived(match.outcome === 'walkover')
  const result = (i: 0 | 1) => (walkover ? (match.winner === i ? 'W' : '–') : String(match.legs[i]))
</script>

{#snippet side(s: (typeof sides)[number], score: string | null)}
  <span class="flex min-w-0 items-center gap-2.5">
    {#if s.entry}
      <Avatar name={s.entry.name} face={faceOf(s.entry)} size={32} />
    {:else}
      <span class="size-8 shrink-0 rounded-full border-[1.5px] border-dashed border-line-3" aria-hidden="true"></span>
    {/if}
    <span class="min-w-0 grow truncate {s.entry ? 'text-body font-semibold' : 'text-label text-text-muted'} {s.lost ? 'text-text-dim' : ''}"
      >{s.name}</span
    >
    {#if score !== null}
      <span class="font-display text-section-title font-bold {s.won ? 'text-accent' : s.lost ? 'text-text-dim' : 'text-text'}">{score}</span
      >
    {/if}
  </span>
{/snippet}

{#if live || finished}
  <article
    class="flex flex-col gap-2.5 rounded-panel border p-4 {device ? 'border-live/40 bg-live-soft' : 'border-line-2 bg-surface-panel'}"
    aria-label="{label}: {sides[0].name} vs {sides[1].name}"
  >
    <div class="flex flex-wrap items-center gap-2 text-small text-ink-2">
      {#if finished}
        {label} · finished{match.finishedAt ? ` ${clock(match.finishedAt)}` : ''}
        {#if walkover}
          <span class="inline-flex h-5 items-center rounded-pill bg-surface-chip px-2 type-pill text-caption font-bold text-ink-2"
            >FORFEIT</span
          >
        {/if}
      {:else if device}
        <span class="inline-flex h-5 items-center gap-1.5 rounded-pill bg-live px-2 type-pill text-caption font-bold text-bg">
          <span class="size-1.5 animate-pulse rounded-full bg-bg motion-reduce:animate-none"></span>LIVE
        </span>
        {label} · on {mine ? 'this device' : device.name}
      {:else}
        <span class="inline-flex h-5 items-center rounded-pill bg-surface-chip px-2 type-pill text-caption font-bold text-ink-2"
          >PAUSED</span
        >
        {label} · no device is playing it
      {/if}
    </div>
    {@render side(sides[0], result(0))}
    {@render side(sides[1], result(1))}
    {#if live}<span class="text-small text-text-muted">{scoreLine(match, [sides[0].name, sides[1].name], gameId)}</span>{/if}
    {#if live && (!device || mine) && match.game}
      <Button variant={mine ? 'outline' : 'accent'} class="self-start" onclick={() => oncontinue(match)}>
        <StepForward size={16} aria-hidden="true" />{mine ? 'Open match' : 'Continue here'}
      </Button>
    {/if}
  </article>
{:else}
  <article
    class="flex items-center gap-3.5 rounded-panel border border-line-2 bg-surface-panel px-4 py-3.5 {match.status === 'pending'
      ? 'opacity-70'
      : ''}"
    aria-label="{label}: {sides[0].name} vs {sides[1].name}"
  >
    <span class="w-12 shrink-0 font-display text-body-lg font-bold text-text-muted">{label}</span>
    <div class="flex min-w-0 grow flex-col gap-2.5">
      {@render side(sides[0], null)}
      {@render side(sides[1], null)}
    </div>
    {#if match.status === 'ready'}
      <Button variant="accent" size="lg" onclick={() => onplay(match)}>
        <Play size={18} aria-hidden="true" />Play
      </Button>
    {:else if match.status === 'pending'}
      <span class="shrink-0 text-small text-text-muted">{waiting}</span>
    {/if}
  </article>
{/if}
