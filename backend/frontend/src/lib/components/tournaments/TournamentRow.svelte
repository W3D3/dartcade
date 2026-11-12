<script lang="ts">
  // One tournament on Browse (Tournaments .trow, Tournaments-Phone's card): when, name, organizer
  // and game, entry and format, the spots taken, and Register (Register team) or why not; your team
  // still to complete says how many are to confirm. The name opens Details.
  import { Check, User, UsersRound } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import { Button } from '$lib/components/ui/button'
  import type { TournamentSummary } from '$lib/api'
  import { avgTag, notEligibleLine } from '$lib/tournaments/avgLimit'
  import { REGISTRATION_NOTE, byLine, entryLabel, formatLine, gamePill, spots, whenParts } from '$lib/tournaments/browse'
  import { teamStatus } from '$lib/tournaments/roster'
  import { currentUser } from '$lib/auth'

  let {
    t,
    busy = false,
    onopen,
    onregister,
    onregisterteam,
  }: { t: TournamentSummary; busy?: boolean; onopen: () => void; onregister: () => void; onregisterteam: () => void } = $props()

  const when = $derived(whenParts(t.startsAt))
  const live = $derived(t.status === 'running')
  const s = $derived(spots(t))
  const why = $derived(t.registration === 'not_eligible' && t.eligibility && t.avgLimit ? notEligibleLine(t.eligibility, t.avgLimit) : '')
  const team = $derived(t.team ? teamStatus(t.team, $currentUser?.id ?? '') : null)
  const note = $derived(team?.long ?? (why ? `${REGISTRATION_NOTE[t.registration]} · ${why}` : REGISTRATION_NOTE[t.registration]))
</script>

<!-- Desktop: the five columns of the board's table -->
<div
  class="hidden grid-cols-[72px_minmax(0,1.6fr)_minmax(0,1fr)_130px_136px] items-center gap-4 border-t border-surface-inset px-4 py-3.5 hover:bg-surface-drop md:grid"
>
  {@render whenBox(72)}
  <div class="flex min-w-0 flex-col gap-1.5">
    <button
      type="button"
      onclick={onopen}
      class="cursor-pointer truncate text-left text-body-lg font-semibold leading-tight text-text hover:underline"
    >
      {t.name}
    </button>
    {#if t.kind === 'community'}
      <span class="flex items-center gap-1.5 whitespace-nowrap text-small text-text-muted">
        <Avatar name={t.owner?.name ?? '?'} face={null} size={18} />{byLine(t)}
      </span>
    {/if}
    <span class="flex flex-wrap gap-1.5">
      <span class="inline-flex h-[22px] items-center rounded-full bg-surface-chip px-2 text-caption font-bold tracking-section text-ink-2">
        {gamePill(t.gameId, t.gameConfig)}
      </span>
      {#if t.avgLimit}
        <span
          class="inline-flex h-[22px] items-center rounded-full bg-accent-tint px-2 text-caption font-bold tracking-section text-accent"
        >
          {avgTag(t.avgLimit, t.teamSize)}
        </span>
      {/if}
    </span>
  </div>
  <div class="flex flex-col gap-1 text-small text-ink-2">
    <span class="flex items-center gap-1.5">{@render entryIcon()}{entryLabel(t.teamSize)}</span>
    <span class="text-text-muted">{formatLine(t)}</span>
  </div>
  {@render spotsBar()}
  <div class="flex justify-end">
    {#if t.registration === 'open'}
      <Button variant="accent" size="sm" disabled={busy} onclick={onregister}>Register</Button>
    {:else if t.registration === 'team'}
      <Button variant="accent" size="sm" disabled={busy} onclick={onregisterteam}>Register team</Button>
    {:else if team}
      <Button variant={team.mine ? 'accent' : 'outline'} size="sm" onclick={onopen}>{team.short}</Button>
    {:else if t.registration === 'registered'}
      <span
        class="inline-flex h-9 items-center gap-1.5 rounded-md border border-accent-line bg-accent-tint px-3 text-small font-semibold text-accent"
      >
        <Check size={15} />Registered
      </span>
    {:else if t.registration === 'not_eligible'}
      <span class="flex flex-col items-end gap-1">
        <Button variant="outline" size="sm" disabled>Not eligible</Button>
        <span class="whitespace-nowrap text-caption text-text-muted">{why}</span>
      </span>
    {:else}
      <span class="flex flex-col items-end gap-1">
        <Button variant="outline" size="sm" onclick={onopen}>Details</Button>
        {#if t.registration !== 'full'}<span class="whitespace-nowrap text-caption text-text-muted">{note}</span>{/if}
      </span>
    {/if}
  </div>
</div>

<!-- Phone: a card; tapping it opens Details, where Register is -->
<button
  type="button"
  onclick={onopen}
  class="flex w-full cursor-pointer items-center gap-3 rounded-card border border-line bg-surface-panel p-3 text-left md:hidden"
>
  {@render whenBox(58)}
  <span class="flex min-w-0 flex-1 flex-col gap-1">
    <span class="truncate text-body font-semibold text-text">{t.name}</span>
    <span class="flex items-center gap-1.5 text-caption text-text-muted">
      {@render entryIcon()}{entryLabel(t.teamSize)} · {t.kind === 'official' ? 'official' : `by ${t.owner?.name ?? 'a former player'}`} · {t.entries}/{t.maxEntries}
    </span>
    <span
      class="text-caption font-bold {t.registration === 'open' || t.registration === 'team' || t.registration === 'registered'
        ? 'text-accent'
        : 'text-text-muted'}"
    >
      {note}
    </span>
  </span>
</button>

{#snippet entryIcon()}
  {#if t.teamSize === 1}<User size={14} aria-hidden="true" />{:else}<UsersRound size={14} aria-hidden="true" />{/if}
{/snippet}

{#snippet whenBox(px: number)}
  {#if live}
    <span
      style="width:{px}px;height:{px}px"
      class="box-border flex flex-none flex-col items-center justify-center gap-0.5 rounded-xl border border-danger-line bg-live-soft"
    >
      <span class="flex items-center gap-1 text-caption font-extrabold tracking-[.12em] text-live">
        <span class="size-[7px] rounded-full bg-live"></span>LIVE
      </span>
    </span>
  {:else}
    <span
      style="width:{px}px;height:{px}px"
      class="box-border flex flex-none flex-col items-center justify-center rounded-xl border border-line-2 bg-surface-row leading-none"
    >
      {#if when}
        <span class="text-caption font-bold tracking-[.12em] text-ink-faint"
          >{px > 60 ? `${when.weekday} · ${when.month}` : when.weekday}</span
        >
        <span class="font-display font-bold {px > 60 ? 'text-card-title' : 'text-player-name'}">{when.day}</span>
        <span class="text-caption text-ink-2">{when.time}</span>
      {:else}
        <span class="px-1 text-center text-caption font-bold tracking-cta text-ink-faint">TBA</span>
      {/if}
    </span>
  {/if}
{/snippet}

{#snippet spotsBar()}
  <div class="flex w-full flex-col gap-1.5">
    <div class="flex justify-between text-small text-text-muted">
      <span><b class="text-text">{t.entries}</b> / {t.maxEntries}</span><span>{s.left}</span>
    </div>
    <span class="h-1.5 overflow-hidden rounded-[3px] bg-surface-paused">
      <span class="block h-full rounded-[3px] {s.full ? 'bg-live' : 'bg-accent'}" style="width:{s.percent}%"></span>
    </span>
  </div>
{/snippet}
