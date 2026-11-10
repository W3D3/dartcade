<script lang="ts">
  // One search field for the Friends page (Friends-Search boards): your friends answer at once, and
  // from 3 characters "People on Dartcade" follows from the server. A bits-ui Combobox, so the
  // arrow keys, Enter and Escape work from the field; Enter on a person does what their row says
  // (Add, Accept, Undo). The text is the page's ?q= filter too, so a reload keeps it.
  import { Combobox } from 'bits-ui'
  import { Check, CircleAlert, Search, X } from '@lucide/svelte'
  import type { FriendSearchHit } from '$lib/api'
  import type { Friend, OutgoingFriendRequest } from '$lib/api/lobby-ws'
  import Avatar from '$lib/components/Avatar.svelte'
  import Toast from '$lib/components/ui/toast/toast.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { cancelRequest, sendRequest } from '$lib/friends/actions'
  import { createPeopleSearch } from '$lib/friends/peopleSearch.svelte'
  import { filterFriends, mutualMeta, searchState, statusLine, SEARCH_MIN } from '$lib/friends/view'

  let {
    query,
    friends,
    outgoing,
    onquery,
    class: className = '',
  }: {
    /** The text in the field: the page's ?q=. */
    query: string
    friends: Friend[]
    outgoing: OutgoingFriendRequest[]
    onquery: (q: string) => void
    class?: string
  } = $props()

  const FRIENDS_SHOWN = 5
  const search = createPeopleSearch()
  let open = $state(false)
  // The field and its rule line: the panel opens below both, as wide as the field
  let anchor = $state<HTMLElement | null>(null)
  let picked = $state('')
  let toast = $state<{ text: string; tone: 'success' | 'error'; undo?: () => void } | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  const text = $derived(query.trim())
  const allMatching = $derived(filterFriends(friends, text))
  const matchingFriends = $derived(allMatching.slice(0, FRIENDS_SHOWN))
  const friendIds = $derived(new Set(allMatching.map(f => f.id)))
  // A friend who matches by name is in the first group (or on the page below); one found by exact email stays here, marked Friends
  const people = $derived(search.people.filter(p => !friendIds.has(p.id)))
  const stateOf = search.stateOf
  const showSuggestions = $derived(text === '')
  const missing = $derived(SEARCH_MIN - Array.from(text.replace(/^@/, '')).length)

  $effect(() => {
    search.search(query)
  })
  $effect(() => {
    if (open && showSuggestions) void search.suggest()
  })
  const status = $derived(
    open
      ? showSuggestions
        ? `${search.suggestions.length} suggestions`
        : search.phase === 'loading'
          ? 'Searching'
          : `${matchingFriends.length} friends, ${people.length} people found`
      : '',
  )

  function say(next: typeof toast) {
    clearTimeout(toastTimer)
    toast = next
    toastTimer = setTimeout(() => (toast = null), 6000)
  }
  const dismiss = () => {
    clearTimeout(toastTimer)
    toast = null
  }

  async function add(p: FriendSearchHit) {
    const before = stateOf(p)
    search.mark(p.id, 'sent')
    const r = await sendRequest(p.name)
    if (!r.ok) {
      search.mark(p.id, before)
      say({ text: r.text, tone: 'error' })
      return
    }
    if (r.accepted) {
      search.mark(p.id, 'friends')
      say({ text: `You and ${p.name} are friends now`, tone: 'success' })
      return
    }
    say({ text: `Request sent to ${p.name}`, tone: 'success', undo: () => void undo(p, r.id) })
  }

  async function undo(p: FriendSearchHit, requestId?: string) {
    const id = requestId ?? outgoing.find(o => o.to.id === p.id)?.id
    if (!id) return
    const error = await cancelRequest(id)
    if (error) return say({ text: error, tone: 'error' })
    search.mark(p.id, 'none')
    dismiss()
  }

  // bits-ui closes the panel when a row is chosen; for a person that is wrong (the row stays to show
  // "Request sent" and Undo). Their rows are labelled with the typed text, which bits-ui writes back into the field.
  let holding = false
  function hold() {
    holding = true
    setTimeout(() => (holding = false))
  }

  function choose(value: string) {
    picked = ''
    const [kind, id] = [value.slice(0, 1), value.slice(2)]
    if (kind === 'f') {
      const f = friends.find(x => x.id === id)
      if (f) onquery(f.name)
      open = false
      return
    }
    const p = [...people, ...search.suggestions].find(x => x.id === id)
    if (!p) return
    hold()
    const state = stateOf(p)
    if (state === 'sent') void undo(p)
    else if (state === 'none' || state === 'received') void add(p)
  }

  const itemClass =
    'flex min-h-[64px] w-full items-center gap-3 rounded-md px-3 py-[10px] text-left cursor-pointer outline-none data-[highlighted]:bg-surface-nav-active data-[highlighted]:ring-2 data-[highlighted]:ring-inset data-[highlighted]:ring-accent'
  const groupLabel = 'px-3 pt-[10px] pb-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-text-dim'
</script>

{#snippet who(id: string, name: string, avatar: Friend['avatar'], note: string, wide = false)}
  <Avatar {name} face={{ avatar, userId: id }} size={40} />
  <span class="flex min-w-0 grow flex-col gap-[2px] {wide ? 'max-md:basis-[calc(100%-52px)]' : ''}">
    <span class="flex items-baseline gap-2 text-[15px] font-semibold">
      <span class="truncate">{name}</span><span class="font-mono text-[12px] font-normal text-text-dim truncate">{`@${name}`}</span>
    </span>
    {#if note}<span class="text-[13px] text-text-muted {wide ? '' : 'truncate'}">{note}</span>{/if}
  </span>
{/snippet}

{#snippet person(p: FriendSearchHit)}
  {@const state = searchState(stateOf(p))}
  {@const note = [state.action === 'Accept' ? state.text : '', mutualMeta(p.mutualFriends)].filter(Boolean).join(' · ')}
  {@const wide = ['sent', 'received'].includes(stateOf(p))}
  <Combobox.Item value={`p:${p.id}`} label={query} class="{itemClass} {wide ? 'max-md:flex-wrap' : ''}">
    {@render who(p.id, p.name, p.avatar, note, wide)}
    {#if state.action}
      <span
        class="shrink-0 h-11 md:h-9 min-w-[44px] px-4 max-md:ml-auto flex items-center justify-center rounded-key bg-accent text-on-accent text-[14px] font-semibold"
        >{state.action}</span
      >
    {:else if stateOf(p) === 'sent'}
      <span class="shrink-0 flex items-center gap-[6px] text-[13px] text-text-muted max-md:ml-auto"
        ><Check size={14} strokeWidth={3} />Request sent<span class="pl-2 font-semibold text-accent">Undo</span></span
      >
    {:else}
      <span class="shrink-0 flex items-center gap-[6px] text-[13px] text-text-muted"><Check size={14} strokeWidth={3} />{state.text}</span>
    {/if}
  </Combobox.Item>
{/snippet}

{#snippet skeleton()}
  {#each [0, 1] as i (i)}
    <div aria-hidden="true" class="flex min-h-[64px] items-center gap-3 px-3 animate-pulse">
      <span class="size-10 rounded-full bg-surface-key"></span>
      <span class="flex grow flex-col gap-2"
        ><span class="h-3 w-2/5 rounded-[4px] bg-surface-key"></span><span class="h-[10px] w-1/4 rounded-[4px] bg-surface-chip"
        ></span></span
      >
    </div>
  {/each}
{/snippet}

{#snippet hint(title: string, body: string, icon: 'search' | 'warn', retry = false)}
  <div class="flex flex-col items-start gap-2 px-3 py-4 text-text-muted">
    {#if icon === 'warn'}<CircleAlert size={20} />{:else}<Search size={20} />{/if}
    <span class="text-[15px] font-semibold text-text">{title}</span>
    <span class="text-[13px] leading-[1.45]">{body}</span>
    {#if retry}
      <Button variant="outline" onclick={() => search.search(query)} class="h-11 md:h-9 rounded-key border-line-strong px-4 text-[14px]"
        >Retry</Button
      >
    {/if}
  </div>
{/snippet}

<div class="flex flex-col gap-2 {className}" bind:this={anchor}>
  <Combobox.Root
    type="single"
    bind:open={() => open, (v: boolean) => (open = v || holding)}
    bind:value={picked}
    inputValue={query}
    onValueChange={choose}
    items={[]}
  >
    <div
      class="relative flex items-center h-[52px] md:h-12 box-border rounded-lg border bg-surface-card {open
        ? 'border-accent ring-1 ring-accent'
        : 'border-line-strong'}"
    >
      <Search size={18} class="pointer-events-none ml-[14px] mr-[10px] shrink-0 text-text-muted" />
      <Combobox.Input
        aria-label="Search friends or find people"
        placeholder="Search friends, or find people by name or email"
        autocomplete="off"
        spellcheck="false"
        oninput={e => {
          open = true
          onquery(e.currentTarget.value)
        }}
        onclick={() => (open = true)}
        onfocus={() => (open = true)}
        onkeydown={e => {
          if (e.key === 'Escape' && !open) onquery('')
        }}
        class="h-full min-w-0 grow bg-transparent text-[16px] text-text outline-none placeholder:text-text-faint"
      />
      {#if search.phase === 'loading'}
        <span aria-hidden="true" class="mr-3 size-4 shrink-0 animate-spin rounded-full border-2 border-line-chip border-t-accent"></span>
      {/if}
      {#if query !== ''}
        <button
          type="button"
          aria-label="Clear search"
          onclick={() => onquery('')}
          class="flex size-11 shrink-0 items-center justify-center text-ink-2 hover:text-text"><X size={16} strokeWidth={2.2} /></button
        >
      {/if}
    </div>
    <Combobox.Portal>
      <Combobox.Content
        customAnchor={anchor}
        sideOffset={8}
        collisionPadding={8}
        class="z-60 box-border w-(--bits-floating-anchor-width) rounded-popover border border-line-popover bg-surface-inset outline-none shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
      >
        <Combobox.Viewport class="flex max-h-[min(560px,var(--bits-floating-available-height))] flex-col gap-1 overflow-auto p-[6px]">
          {#if showSuggestions}
            <p class="px-3 pt-2 text-[13px] leading-[1.45] text-text-muted">Search by name, or paste an exact email address.</p>
            {#if search.suggestions.length > 0}
              <div role="group" aria-label="People you may know">
                <div class={groupLabel}>People you may know</div>
                {#each search.suggestions as p (p.id)}{@render person(p)}{/each}
              </div>
            {/if}
          {:else}
            {#if matchingFriends.length > 0}
              <div role="group" aria-label="Your friends">
                <div class={groupLabel}>Your friends · {matchingFriends.length}</div>
                {#each matchingFriends as f (f.id)}
                  {@const line = statusLine(f)}
                  <Combobox.Item value={`f:${f.id}`} label={f.name} class={itemClass}>
                    {@render who(f.id, f.name, f.avatar, line.text)}
                    <span class="shrink-0 flex items-center gap-[6px] text-[13px] text-text-muted"
                      ><Check size={14} strokeWidth={3} />Friends</span
                    >
                  </Combobox.Item>
                {/each}
              </div>
            {/if}
            {#if search.phase === 'short'}
              <p class="p-3 text-[13px] leading-[1.45] text-text-muted">
                Type {missing} more letter{missing === 1 ? '' : 's'} to search everyone on Dartcade.
              </p>
            {:else if search.phase === 'error'}
              {@render hint(
                'Couldn’t search right now',
                'Your friends are shown above. Check your connection and try again.',
                'warn',
                true,
              )}
            {:else if search.phase === 'limited'}
              {@render hint('Slow down a little', 'You searched a lot in a short time. Try again in a few seconds.', 'warn')}
            {:else if people.length > 0}
              <div role="group" aria-label="People on Dartcade">
                <div class={groupLabel}>People on Dartcade · {people.length}</div>
                {#each people as p (p.id)}{@render person(p)}{/each}
              </div>
            {:else if search.phase === 'loading'}
              <div role="group" aria-label="People on Dartcade">
                <div class={groupLabel}>People on Dartcade</div>
                {@render skeleton()}
              </div>
            {:else if matchingFriends.length === 0}
              {@render hint(
                `No players found for “${text}”`,
                'Try fewer letters, check the spelling, or paste their exact email address.',
                'search',
              )}
            {/if}
          {/if}
        </Combobox.Viewport>
      </Combobox.Content>
    </Combobox.Portal>
  </Combobox.Root>
  <p class="text-[12px] leading-[1.4] text-text-muted">Names: type 3 or more letters. Email: exact address only.</p>
  <div role="status" aria-live="polite" class="sr-only">{status}</div>
</div>

{#if toast}
  <Toast tone={toast.tone} actionLabel={toast.undo ? 'Undo' : undefined} onaction={toast.undo} onclose={dismiss}>{toast.text}</Toast>
{/if}
