<!-- Admin user management (`#/admin/users`): search accounts, set their role (admin, moderator, none). -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { DropdownMenu } from 'bits-ui'
  import { Search, Check, Ellipsis } from '@lucide/svelte'
  import { createColumnHelper, renderSnippet, type SortingState, type ColumnVisibilityState } from '@tanstack/svelte-table'
  import Layout from '$lib/components/Layout.svelte'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import Avatar from '$lib/components/Avatar.svelte'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Breadcrumb } from '$lib/components/ui/breadcrumb/index.js'
  import { usersTrail } from '$lib/admin/breadcrumbs'
  import { buttonVariants } from '$lib/components/ui/button/button-variants.js'
  import { DataTable, ColumnToggle, type Features } from '$lib/components/ui/data-table/index.js'
  import { currentUser } from '$lib/auth'
  import { cn } from '$lib/utils.js'
  import {
    createUserSearch,
    joinedDate,
    lastLoginText,
    compareLastLogin,
    loadColumnVisibility,
    saveColumnVisibility,
    roleActions,
    roleChange,
    setUserRole,
    setVerified,
    type AdminUser,
    type Role,
  } from '$lib/admin/users'

  // Not an admin: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

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
  let confirmAction = $state<{ kind: 'role'; user: AdminUser; role: Role } | { kind: 'verified'; user: AdminUser } | null>(null)
  let busyId = $state<string | null>(null)
  let rowError = $state<{ id: string; text: string } | null>(null)

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
    const result = action.kind === 'role' ? await setUserRole(user.id, action.role) : await setVerified(user.id, !user.emailVerified)
    busyId = null
    if ('error' in result) {
      rowError = { id: user.id, text: result.error }
      return
    }
    users = users.map(u => (u.id === user.id ? result.user : u))
    // Demoting yourself: the guard above only redirects once $currentUser reflects it
    if (action.kind === 'role' && user.id === $currentUser?.id) await currentUser.refresh()
  }

  // Newest first by default; the columns menu can hide any of these but user and actions
  const COLUMN_TOGGLES = [
    { id: 'joined', label: 'Joined' },
    { id: 'lastLogin', label: 'Last login' },
    { id: 'email', label: 'Email' },
    { id: 'verified', label: 'Verified' },
    { id: 'role', label: 'Role' },
  ]

  let sorting = $state<SortingState>([{ id: 'joined', desc: true }])
  const storage = typeof localStorage === 'undefined' ? null : localStorage
  // Verified is visible by default; a stored choice (including hiding it) wins over that
  let columnVisibility = $state<ColumnVisibilityState>(loadColumnVisibility(storage))
  $effect(() => saveColumnVisibility(storage, columnVisibility))

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
    helper.display({
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      enableHiding: false,
      cell: info => renderSnippet(actionsCell, info.row.original),
    }),
  ])
</script>

{#snippet userCell(user: AdminUser)}
  <div class="flex min-w-0 items-center gap-3">
    <Avatar name={user.name} size={32} />
    <span class="truncate text-[14px] font-semibold text-text">{user.name}</span>
  </div>
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

{#snippet actionsCell(user: AdminUser)}
  <div class="flex flex-col items-start gap-1">
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Actions for {user.name}"
        disabled={busyId === user.id}
        class={cn(buttonVariants({ variant: 'outline', size: 'icon' }))}
      >
        <Ellipsis size={18} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          class="z-[60] min-w-[220px] box-border p-[6px] rounded-xl bg-surface-hover border border-line-popover
                 [box-shadow:0_18px_44px_rgba(0,0,0,0.55)] flex flex-col gap-[2px] outline-none"
        >
          {#each roleActions(user.role) as action (action.role ?? 'none')}
            <DropdownMenu.Item
              onSelect={() => askRole(user, action.role)}
              class="flex h-10 items-center rounded-lg px-[10px] text-[14px] cursor-pointer outline-none data-[highlighted]:bg-surface-paused {action.role ===
              null
                ? 'text-live-text'
                : 'text-text'}"
            >
              {action.label}
            </DropdownMenu.Item>
          {/each}
          <DropdownMenu.Item
            onSelect={() => askVerified(user)}
            class="flex h-10 items-center rounded-lg px-[10px] text-[14px] text-text cursor-pointer outline-none data-[highlighted]:bg-surface-paused"
          >
            {user.emailVerified ? 'Mark email as unverified' : 'Mark email as verified'}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
    {#if rowError?.id === user.id}<ErrorText>{rowError.text}</ErrorText>{/if}
  </div>
{/snippet}

<Layout title="Users">
  {#if $currentUser?.isAdmin}
    <main class="flex min-h-0 flex-grow flex-col gap-[14px] md:gap-[22px] overflow-y-auto box-border p-4 md:p-[34px_32px] xl:p-[34px_44px]">
      <header class="hidden md:flex flex-col gap-[6px]">
        <Breadcrumb items={usersTrail()} />
        <h1 class="m-0 font-display font-bold text-[48px] leading-none uppercase tracking-[0.02em]">Users</h1>
        <p class="m-0 text-[15px] text-text-muted">Search accounts, set their role</p>
      </header>

      <div class="flex flex-wrap items-center gap-3">
        <label class="flex h-11 w-full max-w-[380px] items-center gap-2 rounded-[10px] border border-line-3 px-3 text-text-muted">
          <Search size={16} />
          <input
            type="search"
            value={q}
            oninput={e => onSearchInput(e.currentTarget.value)}
            placeholder="Search by name or email"
            aria-label="Search by name or email"
            class="min-w-0 flex-grow border-0 bg-transparent text-[14px] text-text outline-none"
          />
        </label>
        <ColumnToggle columns={COLUMN_TOGGLES} bind:visibility={columnVisibility} />
      </div>

      {#if listError}<ErrorText>{listError}</ErrorText>{/if}

      <DataTable data={users} {columns} bind:sorting bind:columnVisibility>
        {#snippet emptyState()}
          {#if !loading && !listError}
            {q ? `No accounts match "${q}".` : 'No accounts yet.'}
          {/if}
        {/snippet}
      </DataTable>
    </main>

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
  {/if}
</Layout>
