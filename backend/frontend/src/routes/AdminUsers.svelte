<!-- Admin user management (`#/admin/users`): search accounts, set their role (admin, moderator, none), give them XP, ban and unban them. -->
<script lang="ts">
  import { SearchInput } from '$lib/components/ui/input/index.js'
  import { untrack } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'
  import { push } from 'svelte-spa-router'
  import { Check, ChevronDown, ChevronRight } from '@lucide/svelte'
  import { createColumnHelper, renderSnippet, type SortingState, type ColumnVisibilityState } from '@tanstack/svelte-table'
  import Layout from '$lib/components/Layout.svelte'
  import PageMain from '$lib/components/PageMain.svelte'
  import PageTitle from '$lib/components/PageTitle.svelte'
  import { deviceStore } from '$lib/storage'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import RankedRatingModal from '$lib/components/admin/RankedRatingModal.svelte'
  import GrantXpModal from '$lib/components/admin/GrantXpModal.svelte'
  import { reloadProgress } from '$lib/progress/store'
  import UserActivity from '$lib/components/admin/UserActivity.svelte'
  import UserAuditModal from '$lib/components/admin/UserAuditModal.svelte'
  import BanUserModal from '$lib/components/admin/BanUserModal.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { usersTrail } from '$lib/admin/breadcrumbs'
  import { Button } from '$lib/components/ui/button/index.js'
  import { DataTable, ColumnToggle, type Features } from '$lib/components/ui/data-table/index.js'
  import { currentUser } from '$lib/auth'
  import { viewAs } from '$lib/admin/impersonate'
  import { banLine } from '$lib/bans'
  import type { BanCategory } from '$shared/bans.js'
  import {
    createUserSearch,
    joinedDate,
    lastLoginText,
    compareLastLogin,
    bridgesText,
    loadColumnVisibility,
    saveColumnVisibility,
    roleChange,
    setUserRole,
    setVerified,
    banUser,
    unbanUser,
    type AdminUser,
    type RankedMode,
    type Role,
  } from '$lib/admin/users'

  // Not an admin: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

  let auditUser = $state<AdminUser | null>(null)
  let q = $state('')
  let users = $state<AdminUser[]>([])
  let loading = $state(false)
  let listError = $state('')

  // Guards against a stale response winning a race: a quick retype can leave an older search
  // in flight after a newer one starts, so only the latest search's result is ever applied.
  const userSearch = createUserSearch(result => {
    loading = false
    if (result) {
      users = result
      listError = ''
    } else {
      listError = "Couldn't load the accounts."
    }
  })
  function runSearch(query: string): void {
    loading = true
    userSearch.search(query)
  }

  let searchTimer: ReturnType<typeof setTimeout> | undefined
  function onSearchInput(value: string): void {
    q = value
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => runSearch(value), 250)
  }

  $effect(() => {
    if ($currentUser?.isAdmin) untrack(() => runSearch(''))
  })

  // The row asking to confirm a promote/demote or verify/unverify, and the one mid-request
  let confirmAction = $state<
    { kind: 'role'; user: AdminUser; role: Role } | { kind: 'verified'; user: AdminUser } | { kind: 'unban'; user: AdminUser } | null
  >(null)
  let busyId = $state<string | null>(null)
  let xpUser = $state<AdminUser | null>(null)
  let ratingChange = $state<{ user: AdminUser; mode: RankedMode; kind: 'set' | 'reset'; rating: number } | null>(null)
  let rowError = $state<{ id: string; text: string } | null>(null)

  // Another admin can't be viewed as (the server refuses), and nor can yourself
  const canViewAs = (user: AdminUser): boolean => user.role !== 'admin' && user.id !== $currentUser?.id

  async function pickViewAs(user: AdminUser): Promise<void> {
    rowError = null
    busyId = user.id
    const result = await viewAs(user.id)
    busyId = null
    if (result) rowError = { id: user.id, text: result.error }
  }

  function askRole(user: AdminUser, role: Role): void {
    rowError = null
    confirmAction = { kind: 'role', user, role }
  }

  function askVerified(user: AdminUser): void {
    rowError = null
    confirmAction = { kind: 'verified', user }
  }

  async function confirmPick(): Promise<void> {
    const action = confirmAction
    if (!action) return
    confirmAction = null
    const { user } = action
    busyId = user.id
    const result =
      action.kind === 'role'
        ? await setUserRole(user.id, action.role)
        : action.kind === 'unban'
          ? await unbanUser(user.id)
          : await setVerified(user.id, !user.emailVerified)
    busyId = null
    if ('error' in result) {
      rowError = { id: user.id, text: result.error }
      return
    }
    users = users.map(u => (u.id === user.id ? result.user : u))
    // Demoting yourself: the guard above only redirects once $currentUser reflects it
    if (action.kind === 'role' && user.id === $currentUser?.id) await currentUser.refresh()
  }

  // The account the ban dialog is open for, and the server's refusal to show in it
  let banning = $state<AdminUser | null>(null)
  let banError = $state('')

  function askBan(user: AdminUser): void {
    rowError = null
    banError = ''
    banning = user
  }

  async function confirmBan(ban: { category: BanCategory; note: string | null; until: string | null }): Promise<void> {
    const user = banning
    if (!user) return
    busyId = user.id
    const result = await banUser(user.id, ban)
    busyId = null
    if ('error' in result) {
      banError = result.error
      return
    }
    banning = null
    users = users.map(u => (u.id === user.id ? result.user : u))
  }

  // Newest first by default; the columns menu can hide any of these but user
  const COLUMN_TOGGLES = [
    { id: 'joined', label: 'Joined' },
    { id: 'lastLogin', label: 'Last login' },
    { id: 'bridges', label: 'Bridges' },
    { id: 'email', label: 'Email' },
    { id: 'verified', label: 'Verified' },
    { id: 'role', label: 'Role' },
    { id: 'ban', label: 'Ban' },
  ]

  let sorting = $state<SortingState>([{ id: 'joined', desc: true }])
  const storage = deviceStore()
  // Verified is visible by default; a stored choice (including hiding it) wins over that
  let columnVisibility = $state<ColumnVisibilityState>(loadColumnVisibility(storage))
  $effect(() => saveColumnVisibility(storage, columnVisibility))

  // Rows opened for their activity; the detail loads when a row opens and is dropped when it closes
  // Bumped after giving XP: the open rows remount and fetch their numbers again
  let activityReload = $state(0)
  const expanded = new SvelteSet<string>()
  function toggleRow(id: string): void {
    if (!expanded.delete(id)) expanded.add(id)
  }

  const helper = createColumnHelper<Features, AdminUser>()
  const columns = helper.columns([
    helper.accessor('name', {
      id: 'user',
      header: 'User',
      enableHiding: false,
      cell: info => renderSnippet(userCell, info.row.original),
    }),
    helper.accessor('email', { header: 'Email' }),
    helper.accessor('emailVerified', {
      id: 'verified',
      header: 'Verified',
      cell: info => renderSnippet(verifiedCell, info.getValue()),
    }),
    helper.accessor('role', {
      header: 'Role',
      cell: info => renderSnippet(roleCell, info.getValue()),
    }),
    helper.accessor('ban', {
      header: 'Ban',
      enableSorting: false,
      cell: info => renderSnippet(banCell, info.row.original),
    }),
    helper.accessor('createdAt', {
      id: 'joined',
      header: 'Joined',
      cell: info => joinedDate(info.getValue()),
    }),
    helper.accessor('lastLoginAt', {
      id: 'lastLogin',
      header: 'Last login',
      sortFn: (rowA, rowB) => compareLastLogin(rowA.original.lastLoginAt, rowB.original.lastLoginAt),
      cell: info => lastLoginText(info.getValue()),
    }),
    helper.accessor(row => row.bridges.connected, {
      id: 'bridges',
      header: 'Bridges',
      cell: info => bridgesText(info.row.original.bridges),
    }),
  ])
</script>

{#snippet userCell(user: AdminUser)}
  <div class="flex min-w-0 items-center gap-2">
    <button
      type="button"
      class="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-text-muted outline-none hover:text-text focus-visible:[outline:2px_solid_var(--color-accent)]"
      aria-expanded={expanded.has(user.id)}
      aria-label="Activity of {user.name}"
      onclick={() => toggleRow(user.id)}
    >
      {#if expanded.has(user.id)}<ChevronDown size={16} aria-hidden="true" />{:else}<ChevronRight size={16} aria-hidden="true" />{/if}
    </button>
    <a href="#/profile/{user.id}" class="flex min-w-0 items-center gap-3 no-underline hover:underline">
      <Avatar name={user.name} face={{ avatar: user.avatar, userId: user.id }} size={32} />
      <span class="truncate text-[14px] font-semibold text-text">{user.name}</span>
    </a>
  </div>
{/snippet}

{#snippet rowDetail(user: AdminUser)}
  <div class="sticky left-0 box-border w-[min(960px,calc(100vw-2rem))] px-4 pt-4">{@render actionsCell(user)}</div>
  {#key activityReload}
    <UserActivity
      {user}
      busy={busyId === user.id}
      canBan={user.role !== 'admin' && user.id !== $currentUser?.id}
      onrole={(role: Role) => askRole(user, role)}
      onverified={() => askVerified(user)}
      onxp={() => ((rowError = null), (xpUser = user))}
      onrating={(mode: RankedMode, kind: 'set' | 'reset', rating: number) => (
        (rowError = null),
        (ratingChange = { user, mode, kind, rating })
      )}
      onban={() => askBan(user)}
      onunban={() => {
        rowError = null
        confirmAction = { kind: 'unban', user }
      }}
    />
  {/key}
{/snippet}

{#snippet verifiedCell(verified: boolean)}
  {#if verified}
    <Badge variant="ready"><Check size={14} aria-hidden="true" />Verified</Badge>
  {:else}
    <Badge variant="pending">Unverified</Badge>
  {/if}
{/snippet}

{#snippet roleCell(role: Role)}
  {#if role === 'admin'}<Badge variant="paired">Admin</Badge>{:else if role === 'moderator'}<Badge variant="pending">Moderator</Badge>{/if}
{/snippet}

{#snippet banCell(user: AdminUser)}
  {#if user.ban}
    <div class="flex max-w-[280px] flex-col items-start gap-1">
      <Badge variant="live">Banned</Badge>
      <span class="text-[13px] text-text">{banLine(user.ban)}</span>
      {#if user.ban.note}<span class="text-[13px] text-text-muted">{user.ban.note}</span>{/if}
    </div>
  {/if}
{/snippet}

{#snippet actionsCell(user: AdminUser)}
  <div class="flex flex-col items-start gap-2">
    <div class="flex flex-wrap gap-2" role="group" aria-label="Actions for {user.name}">
      <Button variant="outline" size="sm" onclick={() => void push(`/profile/${user.id}`)}>Profile</Button>
      <Button variant="outline" size="sm" onclick={() => (auditUser = user)}>Audit log</Button>
      {#if canViewAs(user)}
        <Button variant="outline" size="sm" disabled={busyId === user.id} onclick={() => void pickViewAs(user)}>View as</Button>
      {/if}
    </div>
    {#if rowError?.id === user.id}<ErrorText>{rowError.text}</ErrorText>{/if}
  </div>
{/snippet}

<Layout title="Users">
  {#if $currentUser?.isAdmin}
    <PageMain>
      <PageTitle trail={usersTrail()} title="Users" sub="Search accounts, set their role, ban them" />

      <div class="flex flex-wrap items-center gap-3">
        <SearchInput value={q} oninput={onSearchInput} label="Search by name or email" class="w-full max-w-[380px]" />
        <ColumnToggle columns={COLUMN_TOGGLES} bind:visibility={columnVisibility} />
      </div>

      {#if listError}<ErrorText>{listError}</ErrorText>{/if}

      <DataTable data={users} {columns} bind:sorting bind:columnVisibility {rowDetail} isExpanded={(u: AdminUser) => expanded.has(u.id)}>
        {#snippet emptyState()}
          {#if !loading && !listError}
            {q ? `No accounts match "${q}".` : 'No accounts yet.'}
          {/if}
        {/snippet}
      </DataTable>
    </PageMain>

    {#if auditUser}
      <UserAuditModal user={auditUser} onclose={() => (auditUser = null)} />
    {/if}

    {#if confirmAction?.kind === 'role'}
      {@const change = roleChange(confirmAction.user, confirmAction.role, confirmAction.user.id === $currentUser.id)}
      <ConfirmModal
        title={change.title}
        body={change.body}
        confirmLabel={change.confirm}
        danger={change.danger}
        onconfirm={() => void confirmPick()}
        oncancel={() => (confirmAction = null)}
      />
    {:else if confirmAction?.kind === 'unban'}
      <ConfirmModal
        title="Unban {confirmAction.user.name}?"
        body="They can sign in and play again straight away."
        confirmLabel="Unban"
        onconfirm={() => void confirmPick()}
        oncancel={() => (confirmAction = null)}
      />
    {:else if confirmAction?.kind === 'verified'}
      {@const user = confirmAction.user}
      <ConfirmModal
        title={user.emailVerified ? 'Mark email as unverified?' : 'Mark email as verified?'}
        body={user.emailVerified ? `${user.email} will be treated as unverified.` : `${user.email} will be treated as verified.`}
        confirmLabel={user.emailVerified ? 'Mark unverified' : 'Mark verified'}
        onconfirm={() => void confirmPick()}
        oncancel={() => (confirmAction = null)}
      />
    {/if}
    {#if xpUser}
      <GrantXpModal
        user={xpUser}
        onclose={() => (xpUser = null)}
        ongranted={() => {
          activityReload++
          // Your own XP: the progress bar and your card show it at once
          if (xpUser?.id === $currentUser.id) {
            reloadProgress()
            void currentUser.refresh()
          }
        }}
      />
    {/if}
    {#if ratingChange}
      <RankedRatingModal {...ratingChange} onclose={() => (ratingChange = null)} ondone={() => activityReload++} />
    {/if}
    {#if banning}
      <BanUserModal name={banning.name} error={banError} onconfirm={confirmBan} oncancel={() => (banning = null)} />
    {/if}
  {/if}
</Layout>
