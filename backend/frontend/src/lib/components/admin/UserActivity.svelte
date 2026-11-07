<!-- The expanded row of the admin users table: bridges, games, darts and account details, loaded once when it opens. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { DropdownMenu } from 'bits-ui'
  import { ChevronDown } from '@lucide/svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { buttonVariants } from '$lib/components/ui/button/button-variants.js'
  import { cn } from '$lib/utils.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { gameTitle } from '$shared/gameNames.js'
  import { PLACEMENT_MATCHES, START_RATING, rank } from '$shared/ranked.js'
  import { levelOf } from '$shared/progression.js'
  import { banLine } from '$lib/bans'
  import {
    joinedDate,
    lastLoginText,
    loadUserActivity,
    manualShare,
    roleActions,
    type AdminUser,
    type AdminUserActivity,
    type RankedMode,
    type Role,
  } from '$lib/admin/users'

  let {
    user,
    busy,
    canBan,
    onrole,
    onverified,
    onxp,
    onban,
    onunban,
    onrating,
  }: {
    user: AdminUser
    busy: boolean
    canBan: boolean
    onrole: (role: Role) => void
    onverified: () => void
    onxp: () => void
    onban: () => void
    onunban: () => void
    onrating: (mode: RankedMode, kind: 'set' | 'reset', rating: number) => void
  } = $props()

  let activity = $state<AdminUserActivity | null>(null)
  let failed = $state(false)

  // Fetched once when the row opens; the page remounts it to fetch again
  onMount(async () => {
    activity = await loadUserActivity(user.id)
    failed = activity === null
  })

  const MODES: RankedMode[] = ['1v1', '2v2']
  // A mode they never played has no row: they start placing at the start rating
  const ratingIn = (mode: RankedMode) =>
    activity?.games.ranked.ratings.find(r => r.mode === mode) ?? { mode, rating: START_RATING, rankIndex: null, matches: 0 }

  const n = (v: number): string => v.toLocaleString('en-US')
</script>

{#snippet block(title: string)}
  <h3 class="m-0 mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
{/snippet}

<!-- Sticky and as wide as the screen: the table around it scrolls sideways, and the panel stays in view -->
<div class="sticky left-0 box-border w-[min(960px,calc(100vw-2rem))] p-4" aria-live="polite">
  <!-- The numbers come from /activity and may be missing; the controls read only `user` and never wait for it -->
  {#if failed}
    <ErrorText>Couldn't load the activity of {user.name}.</ErrorText>
  {:else if !activity}
    <p class="m-0 mb-3 text-[14px] text-text-muted">Loading…</p>
  {/if}
  {#snippet none()}<p class="m-0 text-[14px] text-text-muted">—</p>{/snippet}
  <div class="grid gap-6 sm:grid-cols-2">
    <section>
      {@render block('Bridges')}
      {#if !activity}
        {@render none()}
      {:else if activity.bridges.length === 0}
        <p class="m-0 text-[14px] text-text-muted">None connected ({activity.account.boards.length} paired).</p>
      {:else}
        <ul class="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
          {#each activity.bridges as b (b.boardId)}
            <li>
              <Badge variant="ready">Online</Badge>
              <span class="font-semibold text-text">{b.boardName}</span>
              <span class="block text-text-muted">{b.version ?? 'unknown version'} · since {joinedDate(b.connectedAt)}</span>
            </li>
          {/each}
        </ul>
      {/if}
      {#if activity && activity.account.boards.length > activity.bridges.length}
        <p class="m-0 mt-2 text-[13px] text-text-muted">
          Offline: {activity.account.boards
            .filter(b => !activity?.bridges.some(c => c.boardId === b.id))
            .map(b => b.name)
            .join(', ')}
        </p>
      {/if}
    </section>

    <section>
      {@render block('Games')}
      {#if !activity}
        {@render none()}
      {:else}
        <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
          <dt class="text-text-muted">Played</dt>
          <dd class="m-0">{n(activity.games.total)} ({n(activity.games.last30Days)} in 30 days)</dd>
          <dt class="text-text-muted">Last game</dt>
          <dd class="m-0">{activity.games.lastAt ? joinedDate(activity.games.lastAt) : '—'}</dd>
          <dt class="text-text-muted">Ranked</dt>
          <dd class="m-0">
            {n(activity.games.ranked.games)} games{#each activity.games.ranked.ratings as r (r.mode)}
              · {r.mode}
              {r.rankIndex === null ? `placing (${r.matches})` : `${rank(r.rankIndex).name}, ${n(r.rating)} RP`}{/each}
          </dd>
          <dt class="text-text-muted">By mode</dt>
          <dd class="m-0">
            {activity.games.byMode.map(m => `${gameTitle(m.mode)} ${n(m.count)}`).join(' · ') || '—'}
          </dd>
        </dl>
      {/if}
    </section>

    <section>
      {@render block('Darts thrown')}
      {#if !activity}
        {@render none()}
      {:else}
        <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
          <dt class="text-text-muted">Total</dt>
          <dd class="m-0">{n(activity.darts.total)}, {manualShare(activity.darts.manual, activity.darts.total)}</dd>
          <dt class="text-text-muted">Board</dt>
          <dd class="m-0">{n(activity.darts.total - activity.darts.manual)} detected</dd>
          <dt class="text-text-muted">30 days</dt>
          <dd class="m-0">{n(activity.darts.last30Days)}, {manualShare(activity.darts.manualLast30Days, activity.darts.last30Days)}</dd>
        </dl>
      {/if}
    </section>

    <section>
      {@render block('Ranked rating')}
      {#if !activity}
        {@render none()}
      {:else}
        <dl class="m-0 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-[14px]">
          {#each MODES as mode (mode)}
            {@const r = ratingIn(mode)}
            <dt class="text-text-muted">{mode}</dt>
            <dd class="m-0 flex flex-wrap items-center gap-2">
              <span
                >{r.rankIndex === null
                  ? `Placing (${r.matches} of ${PLACEMENT_MATCHES}), ${n(r.rating)} RP hidden`
                  : `${rank(r.rankIndex).name}, ${n(r.rating)} RP`}</span
              >
              <Button variant="outline" size="sm" disabled={busy} onclick={() => onrating(mode, 'set', r.rating)}>Adjust…</Button>
              <Button variant="outline" size="sm" disabled={busy || r.matches === 0} onclick={() => onrating(mode, 'reset', r.rating)}
                >Reset…</Button
              >
            </dd>
          {/each}
        </dl>
      {/if}
    </section>

    <section>
      {@render block('Account')}
      <dl class="m-0 grid items-center grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
        <dt class="text-text-muted">Last login</dt>
        <dd class="m-0">{lastLoginText(user.lastLoginAt)}</dd>
        <dt class="text-text-muted">XP</dt>
        <dd class="m-0 flex flex-wrap items-center gap-2">
          {activity ? `Level ${levelOf(activity.account.xp).level} · ${n(activity.account.xp)} XP` : '—'}
          <Button variant="outline" size="sm" disabled={busy} onclick={onxp}>Give XP</Button>
        </dd>
        <dt class="text-text-muted">Email</dt>
        <dd class="m-0 flex flex-wrap items-center gap-2">
          {user.emailVerified ? 'verified' : 'unverified'}
          <Button variant="outline" size="sm" disabled={busy} onclick={onverified}>
            {user.emailVerified ? 'Mark unverified' : 'Mark verified'}
          </Button>
        </dd>
        <dt class="text-text-muted">Role</dt>
        <dd class="m-0 flex flex-wrap items-center gap-2">
          {user.role ?? 'player'}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger disabled={busy} class={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2')}>
              Change role
              <ChevronDown size={14} aria-hidden="true" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="start"
                sideOffset={6}
                class="z-[60] box-border flex min-w-[180px] flex-col gap-[2px] rounded-xl border border-line-popover bg-surface-hover p-[6px] outline-none [box-shadow:0_18px_44px_rgba(0,0,0,0.55)]"
              >
                {#each roleActions(user.role) as action (action.role ?? 'none')}
                  <DropdownMenu.Item
                    onSelect={() => onrole(action.role)}
                    class="flex h-10 cursor-pointer items-center rounded-lg px-[10px] text-[14px] outline-none data-[highlighted]:bg-surface-paused {action.role ===
                    null
                      ? 'text-danger-text'
                      : 'text-text'}"
                  >
                    {action.label}
                  </DropdownMenu.Item>
                {/each}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </dd>
        <dt class="text-text-muted">Status</dt>
        <dd class="m-0 flex flex-wrap items-center gap-2">
          {#if user.ban}
            <Badge variant="live">Banned</Badge>
            {banLine(user.ban)}
            <Button variant="outline" size="sm" disabled={busy} onclick={onunban}>Unban</Button>
          {:else}
            Active
            {#if canBan}<Button variant="danger" size="sm" disabled={busy} onclick={onban}>Ban…</Button>{/if}
          {/if}
        </dd>
        <dt class="text-text-muted">Friends</dt>
        <dd class="m-0">{activity ? n(activity.account.friends) : '—'}</dd>
        <dt class="text-text-muted">Boards</dt>
        <dd class="m-0">{activity ? n(activity.account.boards.length) : '—'}</dd>
        <dt class="text-text-muted">Country</dt>
        <dd class="m-0">{activity?.account.country ?? '—'}</dd>
      </dl>
    </section>
  </div>
</div>
