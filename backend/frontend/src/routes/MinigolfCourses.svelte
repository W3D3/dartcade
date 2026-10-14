<!--
  Admin course editor (#/admin/minigolf/courses, /courses/:id): the courses on the left, the
  picked course's details and holes in the centre, the hole library on the right. Edits go to the
  course's draft (autosaved, lib/minigolf/editor/store.svelte.ts) until Publish changes.
  Spec: docs/superpowers/specs/2026-10-14-minigolf-course-editor-design.md, "The course editor".
-->
<script lang="ts">
  import { untrack } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { Plus } from '@lucide/svelte'
  import { currentUser } from '$lib/auth'
  import { api } from '$lib/api'
  import Layout from '$lib/components/Layout.svelte'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import CourseHeader from '$lib/components/minigolf/editor/CourseHeader.svelte'
  import CourseHoles from '$lib/components/minigolf/editor/CourseHoles.svelte'
  import HoleLibrary from '$lib/components/minigolf/editor/HoleLibrary.svelte'
  import HoleThumb from '$lib/components/minigolf/editor/HoleThumb.svelte'
  import { sortable, type SortableDrop } from '$lib/actions/sortable'
  import { listKeyMove, listPlacement, reorder, type Direction, type Placement } from '$lib/lobby/dnd'
  import { createReorder } from '$lib/lobby/reorder.svelte'
  import { createCourseStore, type CourseContent } from '$lib/minigolf/editor/store.svelte'
  import { plural } from '$lib/fmt'
  import { courseStatus, courseTotals, holeOf, newHole, publishOutcome, type CourseRow, type HoleRow } from '$lib/minigolf/editor/course'

  // The router passes null on the list route
  let { params = null }: { params?: { id?: string } | null } = $props()

  // Not an admin: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

  let courses = $state<CourseRow[]>([])
  let holes = $state<HoleRow[]>([])
  let listError = $state('')
  async function loadLists(): Promise<void> {
    const [c, h] = await Promise.all([api.GET('/api/minigolf/courses'), api.GET('/api/minigolf/holes')])
    if (c.data) courses = c.data.courses
    if (h.data) holes = h.data.holes
    listError = c.data && h.data ? '' : "Couldn't load the courses."
  }
  $effect(() => {
    if ($currentUser?.isAdmin) untrack(() => void loadLists())
  })

  const courseId = $derived(params?.id ?? null)
  let store = $state<ReturnType<typeof createCourseStore> | null>(null)
  let problems = $state<string[]>([])
  let error = $state<string | null>(null)
  let busy = $state(false)
  let confirmDiscard = $state(false)
  /** The name of a course that turned out to be deleted, shown on the list we went back to. */
  let gone = $state<string | null>(null)
  $effect(() => {
    const id = courseId
    if (!id) {
      store = null
      return
    }
    return untrack(() => {
      const s = createCourseStore(id)
      store = s
      problems = []
      error = null
      void s.load()
      // Leaving the course (another course, another page) saves what's pending
      return () => void s.flush()
    })
  })
  $effect(() => {
    if (store?.status !== 'missing') return
    untrack(() => {
      gone = content?.name ?? 'This course'
      void push('/admin/minigolf/courses')
      void loadLists()
    })
  })

  const content = $derived(store?.content ?? null)
  const holesById = $derived(new Map(holes.map(h => [h.id, h])))
  const holeAt = (id: string) => {
    const row = holesById.get(id)
    return row ? holeOf(row) : null
  }
  const holeName = (id: string) => holeAt(id)?.name ?? 'Missing hole'
  const items = $derived((content?.holeIds ?? []).map(id => ({ id, name: holeName(id), row: holesById.get(id) })))

  function edit(patch: Partial<CourseContent>): void {
    if (!store?.content || store.status === 'conflict') return
    const next = { ...store.content, ...patch }
    store.edit(next)
    problems = []
    error = null
    courses = courses.map(c => (c.id === courseId ? { ...c, draft: next, hasChanges: true } : c))
  }
  const setHoles = (holeIds: string[]) => edit({ holeIds })

  const moves = createReorder(
    () => items,
    (id, placement) => {
      setHoles(reorder(content?.holeIds ?? [], id, placement.position))
      return Promise.resolve(true)
    },
  )
  const place = (id: string, placement: Placement) =>
    void moves.place(id, placement, (list, h) => `${h.name} moved to hole ${list.indexOf(h) + 1} of ${list.length}.`)
  const LIB = 'lib:'
  function ondrop({ id, zone, beforeId }: SortableDrop): void {
    if (zone !== 'course' || !content) return
    if (!id.startsWith(LIB)) return place(id, listPlacement(moves.people, id, beforeId))
    add(id.slice(LIB.length), beforeId)
  }
  /** Adds a library hole before `beforeId` (null: at the end), unless it's already in the course. */
  function add(holeId: string, beforeId: string | null = null): void {
    if (!content || content.holeIds.includes(holeId)) return
    const at = beforeId === null ? -1 : content.holeIds.indexOf(beforeId)
    setHoles(at === -1 ? [...content.holeIds, holeId] : content.holeIds.toSpliced(at, 0, holeId))
  }
  function onkey(id: string, dir: Direction): void {
    if (id.startsWith(LIB)) return
    const placement = listKeyMove(moves.people, id, dir)
    if (placement) place(id, placement)
  }

  async function createHole(body: { hole: ReturnType<typeof newHole> } | { copyOf: string }): Promise<HoleRow | null> {
    busy = true
    const res = await api.POST('/api/minigolf/holes', { body })
    busy = false
    if (!res.data) {
      error = "Couldn't create the hole."
      return null
    }
    holes = [...holes, res.data]
    return res.data
  }
  async function onnew(): Promise<void> {
    const row = await createHole({ hole: newHole() })
    if (!row || !content || !store) return
    setHoles([...content.holeIds, row.id])
    await store.flush()
    void push(`/admin/minigolf/holes/${row.id}?course=${courseId}`)
  }
  async function onduplicate(holeId: string): Promise<void> {
    const row = await createHole({ copyOf: holeId })
    if (row && content) setHoles(content.holeIds.map(id => (id === holeId ? row.id : id)))
  }
  const onremove = (holeId: string) => setHoles((content?.holeIds ?? []).filter(id => id !== holeId))

  async function publish(): Promise<void> {
    if (!store || !content) return
    busy = true
    const holeIds = content.holeIds
    const res = await store.publish().catch(() => 'threw' as const)
    busy = false
    ;({ problems, error } = publishOutcome(res, holeIds))
    if (res === null) await loadLists()
  }
  async function discard(): Promise<void> {
    confirmDiscard = false
    if (!store) return
    busy = true
    problems = []
    error = await store.discard().then(
      () => null,
      () => "Couldn't discard the draft.",
    )
    busy = false
    await loadLists()
  }

  const selected = $derived(courses.find(c => c.id === courseId) ?? null)
  const hasDraft = $derived(!!selected && (!!selected.hasChanges || selected.published === null))

  async function newCourse(): Promise<void> {
    busy = true
    const res = await api.POST('/api/minigolf/courses', { body: { name: 'New course', description: '', difficulty: 1, holeIds: [] } })
    busy = false
    if (!res.data) {
      listError = "Couldn't create a course."
      return
    }
    courses = [...courses, res.data]
    void push(`/admin/minigolf/courses/${res.data.id}`)
  }

  const DIFFICULTY = [
    { value: 1, label: 'Easy' },
    { value: 2, label: 'Medium' },
    { value: 3, label: 'Hard' },
  ] as const
  const listContent = (c: CourseRow) => (c.id === courseId && content) || c.draft || c.published
  const firstHole = (c: CourseRow) => {
    const id = listContent(c)?.holeIds[0]
    return id ? holeAt(id) : null
  }
  const parOf = (holeIds: string[]) => courseTotals(holeIds.map(id => ({ par: holeAt(id)?.par ?? 0 }))).par

  function onbeforeunload(e: BeforeUnloadEvent): void {
    if (store && (store.status === 'unsaved' || store.status === 'saving' || store.status === 'error')) e.preventDefault()
  }
</script>

<svelte:window {onbeforeunload} />

<Layout title="Course editor">
  {#if $currentUser?.isAdmin}
    <main class="flex min-h-0 flex-grow flex-col overflow-y-auto">
      <CourseHeader
        {courseId}
        status={store?.status ?? null}
        savedAt={store?.savedAt ?? null}
        {hasDraft}
        published={!!selected?.published}
        loaded={content !== null}
        {problems}
        {error}
        {busy}
        onpublish={() => void publish()}
        ondiscard={() => (confirmDiscard = true)}
        onreload={() => void store?.load()}
      />
      <div
        class="grid flex-grow gap-6 p-4 md:p-5 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[268px_minmax(0,1fr)_356px]"
        use:sortable={{ ondrop, onkey, oncancel: () => moves.cancelled() }}
      >
        <!-- The courses -->
        <nav aria-label="Courses" class="flex flex-col gap-3">
          <Button variant="outline" disabled={busy} onclick={() => void newCourse()}><Plus size={16} />New course</Button>
          {#if listError}<p class="m-0 text-[14px] text-live-text">{listError}</p>{/if}
          {#if gone}<p role="status" class="m-0 rounded-[10px] border border-line-2 bg-surface-2 p-3 text-[14px]">
              {gone} is gone: someone deleted it.
            </p>{/if}
          <!-- Every course is official in v1 -->
          <h2 class="m-0 text-[11px] label-caps text-text-dim">Official</h2>
          <ul class="m-0 flex list-none flex-col gap-[6px] p-0">
            {#each courses as c (c.id)}
              {@const shown = listContent(c)}
              {@const chip = courseStatus(c)}
              <li>
                <a
                  href="#/admin/minigolf/courses/{c.id}"
                  aria-current={c.id === courseId ? 'page' : undefined}
                  onclick={() => (gone = null)}
                  class="flex items-center gap-[10px] rounded-[12px] border p-2 text-text no-underline
                         {c.id === courseId ? 'border-accent bg-accent-tint' : 'border-line-2 bg-surface-2 hover:bg-surface-hover'}"
                >
                  <HoleThumb hole={firstHole(c)} class="w-[52px] h-[40px]" />
                  <span class="flex min-w-0 flex-grow flex-col">
                    <span class="truncate text-[14px] font-semibold">{shown?.name ?? 'Untitled'}</span>
                    <span class="text-[12px] text-text-muted"
                      >{plural(shown?.holeIds.length ?? 0, 'hole')} · par {parOf(shown?.holeIds ?? [])}</span
                    >
                  </span>
                  <span
                    class="shrink-0 rounded-full px-2 py-[2px] text-[11px] font-semibold
                           {chip === 'Published' ? 'bg-accent-tint text-accent' : 'bg-warn-soft text-warn'}">{chip}</span
                  >
                </a>
              </li>
            {/each}
          </ul>
        </nav>

        <!-- The picked course -->
        <!-- Changed elsewhere: read-only until Reload -->
        <section aria-label="Course" class="flex min-w-0 flex-col gap-5" inert={store?.status === 'conflict'}>
          {#if !courseId}
            <p class="m-0 text-[15px] text-text-muted">Pick a course to edit, or start a new one.</p>
          {:else if store?.status === 'loading'}
            <p class="m-0 text-[15px] text-text-muted">Loading…</p>
          {:else if !content}
            <div class="flex flex-col items-start gap-3">
              <p class="m-0 text-[15px] text-live-text">Couldn't load this course.</p>
              <Button variant="outline" onclick={() => void store?.load()}>Try again</Button>
            </div>
          {:else}
            <div class="flex flex-col gap-2">
              <label class="flex flex-col gap-1">
                <span class="text-[11px] label-caps text-text-dim">Course name</span>
                <input
                  value={content.name}
                  oninput={e => edit({ name: e.currentTarget.value })}
                  class="h-[46px] rounded-[10px] border border-line-3 bg-bg px-3 font-display text-[26px] font-bold uppercase text-text outline-none focus-visible:[outline:2px_solid_var(--color-accent)]"
                />
              </label>
              <input
                value={content.description}
                oninput={e => edit({ description: e.currentTarget.value })}
                aria-label="Short description"
                placeholder="Short description"
                class="h-[38px] rounded-[10px] border border-line-2 bg-bg px-3 text-[14px] text-ink-2 outline-none focus-visible:[outline:2px_solid_var(--color-accent)]"
              />
            </div>
            <div class="flex items-center gap-2 text-[13px] text-text-muted" role="radiogroup" aria-label="Difficulty">
              Difficulty
              {#each DIFFICULTY as d (d.value)}
                <button
                  type="button"
                  role="radio"
                  aria-checked={content.difficulty === d.value}
                  aria-label={d.label}
                  title={d.label}
                  onclick={() => edit({ difficulty: d.value })}
                  class="flex h-6 w-6 items-center justify-center border-0 bg-transparent p-0 cursor-pointer"
                  ><span class="h-[10px] w-[10px] rounded-full {d.value <= content.difficulty ? 'bg-accent' : 'bg-line-3'}"></span></button
                >
              {/each}
              <span class="text-text">{DIFFICULTY[content.difficulty - 1]?.label}</span>
            </div>
            <CourseHoles
              items={moves.people}
              courseId={courseId ?? ''}
              announcement={moves.announcement}
              {busy}
              {onduplicate}
              {onremove}
              onnew={() => void onnew()}
            />
          {/if}
        </section>

        {#if content}
          <div class="lg:col-span-2 xl:col-span-1" inert={store?.status === 'conflict'}>
            <HoleLibrary {holes} inCourse={content.holeIds} onadd={add} />
          </div>
        {/if}
      </div>
    </main>
    {#if confirmDiscard}
      <ConfirmModal
        title="Discard draft?"
        body="This drops every change since the last publish, including its holes' edits – except on holes another course uses too."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        danger
        onconfirm={() => void discard()}
        oncancel={() => (confirmDiscard = false)}
      />
    {/if}
  {/if}
</Layout>
