<!-- Admin feature flags (`#/admin/flags`): turn a flag on or off at runtime, no restart. A
     DataTable (search, feature chips, grouped by feature or flat and sortable); a row opens its
     details card, laid out like the Play page: from lg the table narrows to a column beside the
     card, below lg the card takes the page. The open flag is in the URL (?flag=<key>). -->
<script lang="ts">
  import { SearchInput } from '$lib/components/ui/input/index.js'
  import { untrack } from 'svelte'
  import { MediaQuery } from 'svelte/reactivity'
  import { get } from 'svelte/store'
  import { push, querystring, replace } from 'svelte-spa-router'
  import { Popover } from 'bits-ui'
  import { ChevronLeft, ListTree, X } from '@lucide/svelte'
  import { createColumnHelper, renderSnippet, type ColumnVisibilityState, type SortingState } from '@tanstack/svelte-table'
  import Layout from '$lib/components/Layout.svelte'
  import PageMain from '$lib/components/PageMain.svelte'
  import PageTitle from '$lib/components/PageTitle.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import PopoverPanel from '$lib/components/lobby/PopoverPanel.svelte'
  import MenuItem from '$lib/components/lobby/MenuItem.svelte'
  import { Chip } from '$lib/components/ui/chip/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { DataTable, type Features } from '$lib/components/ui/data-table/index.js'
  import { currentUser } from '$lib/auth'
  import { refreshFlags } from '$lib/flags'
  import { inviteTime } from '$lib/lobby/format'
  import { createUserSearch, type AdminUser } from '$lib/admin/users'
  import { flagsTrail } from '$lib/admin/breadcrumbs'
  import {
    applyDraft,
    changedCellText,
    clearFlag,
    compareFeatures,
    defaultLabel,
    draftFromFlag,
    featureColor,
    featureDepth,
    featureOf,
    featureTree,
    flagName,
    flagSourceText,
    flagStateText,
    flagUsers,
    flagValueText,
    inFeature,
    isDirty,
    isValid,
    listFlags,
    numberDefault,
    numberDraftError,
    overrideLine,
    type AdminFlag,
    type FlagDraft,
    type FlagMode,
  } from '$lib/admin/flags'

  // Not an admin: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

  let flags = $state<AdminFlag[]>([])
  let stale = $state<{ key: string; updatedAt: string }[]>([])
  let loading = $state(false)
  let listError = $state('')
  let staleBusy = $state<Record<string, boolean>>({})

  async function load(): Promise<void> {
    loading = true
    const result = await listFlags()
    loading = false
    if (!result) {
      listError = "Couldn't load the flags."
      return
    }
    listError = ''
    flags = result.flags
    stale = result.stale
    // A link or reload with ?flag=<key>: open that flag once the list is here
    if (linkedKey) {
      const linked = flags.find(f => f.key === linkedKey)
      linkedKey = null
      if (linked) openPanel(linked)
    }
  }
  let linkedKey: string | null = new URLSearchParams(get(querystring) ?? '').get('flag')

  $effect(() => {
    if ($currentUser?.isAdmin) untrack(() => void load())
  })

  async function removeStale(key: string): Promise<void> {
    staleBusy[key] = true
    const err = await clearFlag(key)
    staleBusy[key] = false
    if (!err) await load()
  }

  // The table: a client-side filter on key/description and one feature (a parent takes its
  // sub-features), sortable columns, a click (or Enter on the keyboard-reachable row) opens the
  // details card.
  let query = $state('')
  let feature = $state<string | null>(null)
  const features = $derived(featureTree(flags.map(f => f.key)))
  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase()
    return flags.filter(f => (feature === null || inFeature(f.key, feature)) && `${f.key} ${f.description}`.toLowerCase().includes(q))
  })
  let sorting = $state<SortingState>([{ id: 'flag', desc: false }])

  // Group by feature: a header row per feature, remembered per device (storage may be blocked)
  const GROUP_KEY = 'dartcade.adminFlags.groupByFeature'
  let grouped = $state(readGrouped())
  function readGrouped(): boolean {
    try {
      return localStorage.getItem(GROUP_KEY) !== '0'
    } catch {
      return true
    }
  }
  function setGrouped(on: boolean): void {
    grouped = on
    try {
      localStorage.setItem(GROUP_KEY, on ? '1' : '0')
    } catch {
      // Not remembered: it still applies until the page is left
    }
  }

  const helper = createColumnHelper<Features, AdminFlag>()
  const columns = helper.columns([
    helper.accessor('key', {
      id: 'flag',
      header: 'Flag',
      cell: info => renderSnippet(flagCell, info.row.original),
    }),
    helper.accessor('kind', {
      id: 'type',
      header: 'Type',
      cell: info => kindText(info.row.original),
    }),
    helper.accessor(f => flagStateText(f), {
      id: 'state',
      header: 'State',
      cell: info => renderSnippet(stateCell, info.row.original),
    }),
    helper.accessor(f => flagSourceText(f), { id: 'source', header: 'Source' }),
    helper.accessor(f => flagValueText(f), { id: 'yourValue', header: 'Your value' }),
    helper.accessor(f => f.override?.updatedAt ?? '', {
      id: 'changed',
      header: 'Changed',
      cell: info => changedCellText(info.row.original, new Date()),
    }),
  ])

  // The details card: one flag open at a time, by key (so a reload after a save still finds it).
  let openKey = $state<string | null>(null)
  const openFlag = $derived(flags.find(f => f.key === openKey) ?? null)
  // Beside the card, and on phones, the table keeps only the flag (with its feature tag) and its state
  const phone = new MediaQuery('max-width: 767px')
  const compact = $derived(!!openFlag || phone.current)
  const columnVisibility = $derived<ColumnVisibilityState>(compact ? { type: false, source: false, yourValue: false, changed: false } : {})

  // Nothing here is sent to the server until Save: every edit only changes this draft.
  let draft = $state<FlagDraft>({ kind: 'boolean', mode: 'default', userIds: [] })
  // The draft's chosen users, with names to show as chips (draft.userIds alone is just ids, the
  // request body); kept in lockstep with draft.userIds by every function that changes either.
  let chosenUsers = $state<{ id: string; name: string | null }[]>([])
  const dirty = $derived(openFlag ? isDirty(openFlag, draft) : false)
  const valid = $derived(openFlag ? isValid(openFlag, draft) : false)
  let panelBusy = $state(false)
  let panelError = $state('')
  let saved = $state(false)
  let savedTimer: ReturnType<typeof setTimeout> | undefined

  // Closing the panel or opening another row while the draft is dirty asks first, via the same
  // ConfirmModal used elsewhere; confirming replays whichever of those the admin was doing.
  let confirmDiscard = $state(false)
  let pendingOpen = $state<AdminFlag | null>(null)

  function openPanel(f: AdminFlag): void {
    openKey = f.key
    draft = draftFromFlag(f)
    chosenUsers = flagUsers(f)
    panelBusy = false
    panelError = ''
    saved = false
    pickerQuery = ''
    pickerResults = []
    pickerOpen = false
    void replace(`/admin/flags?flag=${encodeURIComponent(f.key)}`)
  }

  function closePanel(): void {
    openKey = null
    void replace('/admin/flags')
  }

  // Blocked while a save is in flight, not just dirty: that also keeps openKey from moving under
  // save()'s feet, so it can finish writing the draft/flash it started without re-checking which
  // panel is still open.
  function tryOpen(f: AdminFlag): void {
    if (panelBusy) return
    if (openFlag && openFlag.key !== f.key && dirty) {
      pendingOpen = f
      confirmDiscard = true
      return
    }
    openPanel(f)
  }

  function tryClose(): void {
    if (panelBusy) return
    if (dirty) {
      pendingOpen = null
      confirmDiscard = true
      return
    }
    closePanel()
  }

  // "Feature flags" in the trail goes back to the list the same way the panel's own close
  // button does: through tryClose, so a dirty draft gets the discard confirm instead of a raw nav.
  const trail = $derived.by(() => {
    const t = flagsTrail(openFlag?.key)
    if (openFlag)
      t[1] = {
        ...t[1],
        onclick: (e: MouseEvent) => {
          e.preventDefault()
          tryClose()
        },
      }
    return t
  })

  function confirmDiscardChanges(): void {
    confirmDiscard = false
    const next = pendingOpen
    pendingOpen = null
    if (next) openPanel(next)
    else closePanel()
  }

  function cancelDiscard(): void {
    confirmDiscard = false
    pendingOpen = null
  }

  function flash(): void {
    saved = true
    clearTimeout(savedTimer)
    savedTimer = setTimeout(() => {
      saved = false
    }, 4000)
  }

  const FLAG_MODES: readonly FlagMode[] = ['default', 'off', 'admins', 'users', 'on']
  function isFlagMode(v: unknown): v is FlagMode {
    return FLAG_MODES.some(m => m === v)
  }

  function pickMode(mode: unknown): void {
    if (!isFlagMode(mode) || draft.kind !== 'boolean') return
    draft.mode = mode
  }

  async function save(): Promise<void> {
    const f = openFlag
    if (!f || !dirty || !valid) return
    panelBusy = true
    panelError = ''
    const err = await applyDraft(f.key, draft)
    panelBusy = false
    if (err) {
      // The save didn't happen: keep the draft as it is, so the admin can fix it and retry.
      panelError = err
      return
    }
    await load()
    // Re-read by key, not the `f` above: load() may have changed what the flag looks like, and
    // TS would otherwise (wrongly) keep treating `openFlag` as the same non-null value as `f`.
    const updated = flags.find(x => x.key === f.key)
    if (updated) {
      draft = draftFromFlag(updated)
      chosenUsers = flagUsers(updated)
    }
    void refreshFlags()
    flash()
  }

  function discardDraft(): void {
    if (openFlag) {
      draft = draftFromFlag(openFlag)
      chosenUsers = flagUsers(openFlag)
    }
    panelError = ''
  }

  function resetNumberDraft(): void {
    if (draft.kind !== 'number') return
    draft.isDefault = true
  }

  // The 'Chosen users' picker: one race-guarded search (createUserSearch, same ordering
  // guarantee as the Users page), shown in the bits-ui Popover used elsewhere for a live account
  // search (AddSomeone) so dismissal, focus and placement come with it.
  let pickerQuery = $state('')
  let pickerResults = $state<AdminUser[]>([])
  let pickerOpen = $state(false)
  let pickerAnchor = $state<HTMLElement>()
  let pickerTimer: ReturnType<typeof setTimeout> | undefined
  const pickerSearch = createUserSearch(result => {
    pickerResults = result ?? []
  })

  function onPickerInput(value: string): void {
    pickerQuery = value
    pickerOpen = true
    clearTimeout(pickerTimer)
    if (!value) {
      pickerResults = []
      return
    }
    pickerTimer = setTimeout(() => pickerSearch.search(value), 200)
  }

  /** The search's results, minus anyone already chosen in the draft. */
  const pickerChoices = $derived.by(() => {
    if (draft.kind !== 'boolean') return []
    const chosen = new Set(draft.userIds)
    return pickerResults.filter(u => !chosen.has(u.id))
  })

  function addUser(user: AdminUser): void {
    if (draft.kind !== 'boolean') return
    pickerQuery = ''
    pickerResults = []
    pickerOpen = false
    draft.userIds = [...draft.userIds, user.id]
    chosenUsers = [...chosenUsers, { id: user.id, name: user.name }]
  }

  function removeUser(id: string): void {
    if (draft.kind !== 'boolean') return
    draft.userIds = draft.userIds.filter(i => i !== id)
    chosenUsers = chosenUsers.filter(u => u.id !== id)
  }

  const kindText = (f: AdminFlag): string => (f.kind === 'number' ? 'Number' : 'Boolean')

  // The segmented controls' value: draft.mode for a boolean flag, else irrelevant ('default').
  const boolMode = $derived(draft.kind === 'boolean' ? draft.mode : 'default')

  // Global: applies to everyone, no condition. Conditional: on for admins, or a chosen list.
  const globalOptions = (f: AdminFlag) => [
    { value: 'default', label: defaultLabel(f) },
    { value: 'off', label: 'Off' },
    { value: 'on', label: 'Everyone' },
  ]
  const conditionalOptions = [
    { value: 'admins', label: 'Admins' },
    { value: 'users', label: 'Chosen users' },
  ]
</script>

{#snippet featureTag(name: string)}
  <span class="inline-flex max-w-full items-center gap-[6px] font-mono text-[12px] leading-none" style:color={featureColor(name)}>
    <span aria-hidden="true" class="size-2 shrink-0 rounded-full" style:background={featureColor(name)}></span>
    <span class="truncate">{name}</span>
  </span>
{/snippet}

{#snippet flagCell(f: AdminFlag)}
  <!-- Bounded, not just min-w-0: under table-layout:auto (DataTable's default) an unbounded cell
       grows to fit its longest line, which pushed State/Source/Your value/Changed off-screen.
       The flag's own name leads; its feature tag under it (flat list) reads as the rest of the key. The
       description wraps to two lines (line-clamp), and is left out in the compact table. -->
  <div class="flex max-w-[260px] min-w-0 flex-col gap-[5px]" title={f.key}>
    <span class="truncate font-mono text-[14px] font-semibold text-text">{flagName(f.key)}</span>
    <!-- Grouped, the header row above already names the feature -->
    {#if !grouped}{@render featureTag(featureOf(f.key))}{/if}
    {#if !compact}<span class="line-clamp-2 text-[13px] text-text-muted">{f.description}</span>{/if}
  </div>
{/snippet}

{#snippet groupHeader(name: string, count: number)}
  <span class="flex items-center gap-2">
    {@render featureTag(name)}
    <span class="text-[12px] text-text-dim">{count}</span>
  </span>
{/snippet}

{#snippet stateCell(f: AdminFlag)}
  <Badge variant="pending">{flagStateText(f)}</Badge>
{/snippet}

<Layout title="Feature flags">
  {#if $currentUser?.isAdmin}
    <PageMain>
      <PageTitle {trail} title="Feature flags" sub="Turn a flag on or off at runtime, no restart. Open tabs pick it up within 30s." />

      <!-- Every flag; once one is open, a column beside its card from lg (only the card below) -->
      <div class="flex flex-col lg:flex-row gap-[14px] md:gap-4 lg:gap-5 xl:gap-6 {openFlag ? 'lg:flex-grow lg:min-h-0' : ''}">
        <section
          aria-label="Flags"
          class="flex min-w-0 flex-col gap-[14px] {openFlag
            ? 'max-lg:hidden lg:[&>*]:shrink-0 lg:w-[320px] xl:w-[360px] lg:flex-shrink-0 lg:overflow-y-auto scrollbar-themed'
            : 'w-full'}"
        >
          <div class="flex items-center gap-3">
            <SearchInput bind:value={query} label="Filter by key or description" class="max-w-[380px] min-w-0 flex-1" />
            <!-- Icon-only beside the card (and on phones), where the column has no room for the label -->
            <Button
              variant="outline"
              size="md"
              pressed={grouped}
              aria-pressed={grouped}
              aria-label="Group by feature"
              class="h-11 shrink-0 font-semibold {compact ? 'w-11 px-0' : ''}"
              onclick={() => setGrouped(!grouped)}
            >
              <ListTree size={16} />{#if !compact}Group by feature{/if}
            </Button>
          </div>

          {#if features.length > 0}
            <!-- One feature at a time (a parent takes its sub-features); wraps at every width -->
            <div role="group" aria-label="Filter by feature" class="flex flex-wrap gap-2">
              <Chip selected={feature === null} onclick={() => (feature = null)}>All</Chip>
              {#each features as ft (ft)}
                {@const depth = featureDepth(ft)}
                <Chip selected={feature === ft} onclick={() => (feature = ft)}>
                  <span class="inline-flex items-center gap-[6px] whitespace-nowrap">
                    <span aria-hidden="true" class="size-2 shrink-0 rounded-full" style:background={featureColor(ft)}></span>
                    {#if depth > 0}<span class="opacity-50">{ft.slice(0, ft.lastIndexOf('.') + 1)}</span>{/if}{ft.slice(
                      ft.lastIndexOf('.') + 1,
                    )}
                  </span>
                </Chip>
              {/each}
            </div>
          {/if}

          {#if listError}<ErrorText>{listError}</ErrorText>{/if}

          <DataTable
            data={filtered}
            {columns}
            bind:sorting
            {columnVisibility}
            tableClass={compact ? '' : undefined}
            groupBy={grouped ? { key: (f: AdminFlag) => featureOf(f.key), compare: compareFeatures, header: groupHeader } : undefined}
            isSelected={(f: AdminFlag) => f.key === openKey}
            onrowclick={tryOpen}
            rowLabel={(f: AdminFlag) => `Open details for ${f.key}`}
          >
            {#snippet emptyState()}
              {#if !loading && !listError}
                {query || feature ? 'No flags match.' : 'No flags defined.'}
              {/if}
            {/snippet}
          </DataTable>

          {#if stale.length > 0}
            <section class="flex flex-col gap-2">
              <h2 class="m-0 text-[15px] font-semibold text-text-muted">Stale overrides</h2>
              <ul class="m-0 flex list-none flex-col gap-2 p-0">
                {#each stale as s (s.key)}
                  <li class="card flex items-center justify-between gap-3 p-3">
                    <div class="flex min-w-0 flex-col gap-[2px]">
                      <span class="truncate font-mono text-[13px] text-text-muted">{s.key}</span>
                      <span class="text-[13px] text-text-muted">Changed {inviteTime(s.updatedAt, new Date())}</span>
                    </div>
                    <Button variant="outline" size="sm" disabled={staleBusy[s.key]} onclick={() => void removeStale(s.key)}>Remove</Button>
                  </li>
                {/each}
              </ul>
            </section>
          {/if}
        </section>

        {#if openFlag}
          {@const f = openFlag}
          <!-- The details card, styled like the Play page's setup card: its own scroll from lg, the
               Save/Discard footer pinned under it -->
          <section
            aria-labelledby="flag-panel-title"
            class="w-full lg:flex-grow lg:max-w-[728px] xl:max-w-[780px] lg:min-w-0 box-border card md:rounded-[16px] flex flex-col lg:overflow-hidden"
          >
            <div class="lg:flex-1 lg:min-h-0 lg:overflow-y-auto scrollbar-themed p-4 md:p-[26px_28px] pb-4 md:pb-4 flex flex-col gap-4">
              <Button variant="ghost" size="sm" class="lg:hidden self-start -ml-2 pl-2 pr-3 gap-[6px] font-semibold" onclick={tryClose}>
                <ChevronLeft size={16} />All flags
              </Button>
              <div class="flex items-start justify-between gap-3">
                <div class="flex min-w-0 flex-col gap-2">
                  {@render featureTag(featureOf(f.key))}
                  <h2 id="flag-panel-title" class="m-0 break-all font-mono text-[18px] md:text-[20px] font-bold leading-tight">{f.key}</h2>
                  <p class="m-0 text-[14px] text-text-muted">{f.description}</p>
                  <div class="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="pending">{flagStateText(f)}</Badge>
                    <Badge variant="pending">{kindText(f)}</Badge>
                  </div>
                </div>
                <button
                  type="button"
                  onclick={tryClose}
                  aria-label="Close"
                  class="hidden lg:flex -mr-2 -mt-1 h-11 w-11 shrink-0 items-center justify-center border-0 bg-transparent text-ink-2 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
              {#if f.kind === 'boolean'}
                <section class="flex flex-col gap-2 border-t border-line-2 pt-3">
                  <h3 class="m-0 text-[12px] font-semibold label-caps text-text-dim">Global</h3>
                  <SegmentedControl
                    options={globalOptions(f)}
                    value={boolMode}
                    defaultValue="default"
                    disabled={panelBusy}
                    onchange={v => pickMode(v)}
                  />
                </section>
                <section class="flex flex-col gap-2 border-t border-line-2 pt-3">
                  <h3 class="m-0 text-[12px] font-semibold label-caps text-text-dim">Conditional</h3>
                  <SegmentedControl options={conditionalOptions} value={boolMode} disabled={panelBusy} onchange={v => pickMode(v)} />
                  {#if boolMode === 'users'}
                    <div class="flex flex-col gap-2">
                      {#if chosenUsers.length > 0}
                        <div class="flex flex-wrap gap-2">
                          {#each chosenUsers as u (u.id)}
                            <Chip selected onclick={() => removeUser(u.id)}>
                              <span class="inline-flex items-center gap-1">{u.name ?? 'Deleted user'} <X size={12} /></span>
                            </Chip>
                          {/each}
                        </div>
                      {/if}
                      <div bind:this={pickerAnchor}>
                        <Input
                          type="search"
                          placeholder="Search by name or email"
                          bind:value={pickerQuery}
                          oninput={() => onPickerInput(pickerQuery)}
                          onfocus={() => (pickerOpen = true)}
                          disabled={panelBusy}
                        />
                      </div>
                      <Popover.Root
                        open={pickerOpen && pickerChoices.length > 0}
                        onOpenChange={o => {
                          if (!o) pickerOpen = false
                        }}
                      >
                        <PopoverPanel label="Accounts matching &quot;{pickerQuery}&quot;" align="stretch" anchor={pickerAnchor} keepFocus>
                          {#each pickerChoices as u (u.id)}
                            <MenuItem label={u.name} detail={u.email} onclick={() => addUser(u)} />
                          {/each}
                        </PopoverPanel>
                      </Popover.Root>
                    </div>
                  {/if}
                </section>
              {:else if draft.kind === 'number'}
                {@const d = draft}
                {@const numError = d.isDefault ? null : numberDraftError(f, d.number)}
                <section class="flex flex-col gap-2 border-t border-line-2 pt-3">
                  <div class="flex items-center gap-3">
                    <!-- A native input, not the ui Input wrapper: its dynamic `type` prop can't get Svelte's
                       type="number" value coercion, so bind:value there would store a string, not a number. -->
                    <input
                      type="number"
                      min={f.range?.[0]}
                      max={f.range?.[1]}
                      value={d.isDefault ? numberDefault(f) : d.number}
                      oninput={e => {
                        d.isDefault = false
                        // valueAsNumber, not Number(value): an empty field is NaN, not 0, so
                        // numberDraftError's Number.isFinite check catches it instead of silently
                        // saving 0.
                        d.number = e.currentTarget.valueAsNumber
                      }}
                      disabled={panelBusy}
                      class="h-11 w-28 rounded-[10px] border border-line-3 bg-surface-2 px-3 text-text outline-none disabled:opacity-50"
                    />
                    <span class="text-[13px] text-text-muted">{f.range?.[0]}&ndash;{f.range?.[1]}, default {numberDefault(f)}</span>
                  </div>
                  {#if numError}<ErrorText>{numError}</ErrorText>{/if}
                  {#if f.override}
                    <Button variant="outline" size="sm" class="self-start" disabled={panelBusy} onclick={resetNumberDraft}>
                      Reset to default ({numberDefault(f)})
                    </Button>
                  {/if}
                </section>
              {/if}
            </div>

            <!-- The footer: Save sends the draft (one request), Discard resets it. Below lg it sticks
                 to the bottom of the page's scroll (past main's padding), from lg it ends the card. -->
            <div
              class="sticky -bottom-4 md:-bottom-[34px] lg:static z-10 shrink-0 flex flex-col gap-2 rounded-b-[16px] border-t border-line-2 bg-surface-panel px-4 md:px-7 py-4"
            >
              {#if saved}
                <p class="m-0 text-[13px] text-accent">Live now. Open tabs update within half a minute.</p>
              {:else if dirty}
                <p class="m-0 text-[13px] text-text-muted">Unsaved changes</p>
              {:else if overrideLine(f, new Date())}
                <p class="m-0 text-[13px] text-text-muted">{overrideLine(f, new Date())}</p>
              {/if}
              {#if panelError}<ErrorText>{panelError}</ErrorText>{/if}
              <div class="flex gap-2">
                <Button variant="outline" size="sm" class="flex-1" disabled={panelBusy || !dirty} onclick={discardDraft}>Discard</Button>
                <Button variant="accent" size="sm" class="flex-1" disabled={panelBusy || !dirty || !valid} onclick={() => void save()}>
                  Save
                </Button>
              </div>
            </div>
          </section>
        {/if}
      </div>

      {#if !loading && flags.length === 0 && !listError}
        <p class="m-0 text-[15px] text-text-muted">No flags defined.</p>
      {/if}
    </PageMain>

    {#if confirmDiscard}
      <ConfirmModal
        title="Discard changes?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        danger
        onconfirm={confirmDiscardChanges}
        oncancel={cancelDiscard}
      />
    {/if}
  {/if}
</Layout>
