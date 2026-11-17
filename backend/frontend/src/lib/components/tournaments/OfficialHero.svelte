<script lang="ts">
  // The featured official tournament on Browse (Tournaments artboard, the Weekly Open hero): its
  // tags, when registration closes, the game and format, Register and Details, and beside it the
  // prizes, the spots and which friends are in.
  import { CalendarDays, Check, Target, User, UsersRound } from '@lucide/svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import { Button } from '$lib/components/ui/button'
  import type { Tournament } from '$lib/api'
  import { formatLong, friendsInLine, fullWhen, gameLine, spots } from '$lib/tournaments/browse'
  import PrizesCard from './PrizesCard.svelte'
  import TagPills from './TagPills.svelte'

  let {
    t,
    busy = false,
    onopen,
    onregister,
    onregisterteam,
  }: { t: Tournament; busy?: boolean; onopen: () => void; onregister: () => void; onregisterteam: () => void } = $props()

  const s = $derived(spots(t))
  const closes = $derived(t.registrationClosesAt && t.status === 'open' ? `Registration closes ${fullWhen(t.registrationClosesAt)}` : '')
</script>

<section
  aria-label="Featured tournament"
  class="grid gap-5 rounded-card border border-accent-line bg-surface-panel p-4 md:grid-cols-[minmax(0,1fr)_300px] md:gap-8 md:p-7"
>
  <div class="flex min-w-0 flex-col gap-3.5">
    <div class="flex flex-wrap items-center gap-2">
      <TagPills {t} />
      {#if closes}<span class="text-small text-text-muted">{closes}</span>{/if}
    </div>
    <h2 class="type-page-title">{t.name}</h2>
    <ul class="flex flex-wrap gap-x-5 gap-y-1.5 text-label text-ink-2">
      <li class="flex items-center gap-1.5">
        <CalendarDays size={16} aria-hidden="true" />{t.startsAt ? fullWhen(t.startsAt) : 'An organizer starts it'}
      </li>
      <li class="flex items-center gap-1.5">
        <Target size={16} aria-hidden="true" />{gameLine(t.gameId, t.gameConfig, t.settings.firstTo)}
      </li>
      <li class="flex items-center gap-1.5">
        {#if t.teamSize === 1}<User size={16} aria-hidden="true" />{:else}<UsersRound size={16} aria-hidden="true" />{/if}{formatLong(t)}
      </li>
    </ul>
    <div class="mt-1.5 flex flex-wrap items-center gap-2.5">
      {#if t.registration === 'open'}
        <Button variant="accent" disabled={busy} onclick={onregister}><Check size={18} />Register</Button>
      {:else if t.registration === 'team'}
        <Button variant="accent" disabled={busy} onclick={onregisterteam}><UsersRound size={16} />Register a team</Button>
      {:else if t.registration === 'registered'}
        <span class="inline-flex h-10 items-center gap-1.5 text-label font-semibold text-accent"><Check size={16} />You're registered</span>
      {/if}
      <Button variant="outline" onclick={onopen}>Details</Button>
    </div>
  </div>

  <div class="flex flex-col gap-3.5 rounded-xl border border-line-2 bg-surface-inset p-4">
    <PrizesCard prizes={t.prizes} />
    {#if t.prizes.length > 0}<span class="h-px bg-line-2"></span>{/if}
    <div class="flex flex-col gap-1.5">
      <div class="flex justify-between text-small text-text-muted">
        <span><b class="text-text">{t.entries}</b> / {t.maxEntries}</span><span>{s.left}</span>
      </div>
      <span class="h-1.5 overflow-hidden rounded-[3px] bg-surface-paused">
        <span class="block h-full rounded-[3px] {s.full ? 'bg-live' : 'bg-accent'}" style="width:{s.percent}%"></span>
      </span>
    </div>
    {#if t.friendsIn.length > 0}
      <span class="flex items-center gap-2 text-small text-text-muted">
        <span class="inline-flex">
          {#each t.friendsIn.slice(0, 4) as f, i (f.id)}
            <span class={i > 0 ? '-ml-1.5' : ''}><Avatar name={f.name} face={{ avatar: f.avatar, userId: f.id }} size={24} /></span>
          {/each}
        </span>
        {friendsInLine(t.friendsIn.map(f => f.name))}
      </span>
    {/if}
  </div>
</section>
