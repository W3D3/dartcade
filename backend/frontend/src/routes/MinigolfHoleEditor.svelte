<!--
  Admin hole editor (#/admin/minigolf/holes/:id?course=:courseId): the tool rail, a 2D top-down
  canvas, and the Properties panel with the Elements, the live Checks and a small 3D view. Every
  edit is one undo step and goes to the hole's draft (autosaved, lib/minigolf/editor/store.svelte.ts).
  With `course`, the header pages through that course's holes and a strip shows them all.
  Spec: docs/superpowers/specs/2026-10-14-minigolf-course-editor-design.md, "The hole editor".
-->
<script lang="ts">
  import { untrack } from 'svelte'
  import { push, querystring } from 'svelte-spa-router'
  import { ChevronLeft, ChevronRight, Minus, Play, Plus, Redo2, Undo2 } from '@lucide/svelte'
  import { currentUser } from '$lib/auth'
  import { api } from '$lib/api'
  import Layout from '$lib/components/Layout.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import HoleView from '$lib/components/minigolf/HoleView.svelte'
  import Playtest from '$lib/components/minigolf/Playtest.svelte'
  import CheckList from '$lib/components/minigolf/editor/CheckList.svelte'
  import EditorCanvas from '$lib/components/minigolf/editor/EditorCanvas.svelte'
  import ElementList from '$lib/components/minigolf/editor/ElementList.svelte'
  import Properties from '$lib/components/minigolf/editor/Properties.svelte'
  import ToolRail from '$lib/components/minigolf/editor/ToolRail.svelte'
  import { holeOf, type HoleRow } from '$lib/minigolf/editor/course'
  import { createHistory, type History } from '$lib/minigolf/editor/history'
  import { duplicateElement, removeElement } from '$lib/minigolf/editor/ops'
  import {
    apiLoadCourse,
    createHoleStore,
    isUnsaved,
    toHole,
    type CourseContent,
    type DraftStatus,
  } from '$lib/minigolf/editor/store.svelte'
  import { DEFAULT_OPTIONS, TOOLS, type Tool, type ToolOptions } from '$lib/minigolf/editor/tools'
  import { holeChecks, type ElementRef } from '$shared/minigolf/checks'
  import { DEFAULT_PHYSICS } from '$shared/minigolf/physics'
  import { GRID } from '$shared/minigolf/presets'
  import type { Hole } from '$shared/minigolf/types'

  let { params }: { params: { id: string } } = $props()

  // Not an admin: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

  const holeId = $derived(params.id)
  const courseId = $derived(new URLSearchParams($querystring ?? '').get('course'))

  // Raw: `load` tells a stale store from the current one by identity
  let store = $state.raw<ReturnType<typeof createHoleStore> | null>(null)
  let history: History | null = null
  let canUndo = $state(false)
  let canRedo = $state(false)
  let tool = $state<Tool>('select')
  let selection = $state<ElementRef | null>(null)
  let options = $state<ToolOptions>({ ...DEFAULT_OPTIONS })
  let heightMap = $state(false)
  let testPutt = $state(false)

  async function load(s: ReturnType<typeof createHoleStore>): Promise<void> {
    await s.load()
    if (store !== s) return
    history = s.value ? createHistory(s.value) : null
    selection = null
    sync()
  }
  $effect(() => {
    const id = holeId
    return untrack(() => {
      const s = createHoleStore(id)
      store = s
      void load(s)
      // Leaving the hole (another hole, another page) saves what's pending
      return () => void s.flush()
    })
  })

  const hole = $derived(store?.value ?? null)
  const checks = $derived(hole ? holeChecks(hole) : [])
  // Changed elsewhere: read-only until Reload (an edit now could never save)
  const readOnly = $derived(store?.status === 'conflict')

  function sync(): void {
    canUndo = history?.canUndo ?? false
    canRedo = history?.canRedo ?? false
  }
  /** One edit, one undo step; an edit that changes nothing is dropped. */
  function commit(h: Hole): void {
    if (!store?.value || !history || readOnly || JSON.stringify(h) === JSON.stringify(store.value)) return
    history.push(h)
    store.edit(h)
    sync()
  }
  function step(h: Hole | null | undefined): void {
    if (!h || !store) return
    store.edit(h)
    sync()
    if (selection && !exists(h, selection)) selection = null
  }
  const undo = () => !readOnly && step(history?.undo())
  const redo = () => !readOnly && step(history?.redo())

  function exists(h: Hole, ref: ElementRef): boolean {
    const list = { outline: h.outline, bumper: h.bumpers, wall: h.walls, slope: h.slopes, terrain: h.terrain ?? [] }
    return ref.kind === 'tee' || ref.kind === 'cup' || ref.index < list[ref.kind].length
  }

  function remove(): void {
    if (!hole || !selection || selection.kind === 'tee' || selection.kind === 'cup') return
    commit(removeElement(hole, selection))
    selection = null
  }
  function duplicate(): void {
    if (!hole || !selection) return
    const next = duplicateElement(hole, selection, [GRID * 2, GRID * 2])
    commit(next)
    const count = { bumper: next.bumpers.length, wall: next.walls.length, slope: next.slopes.length, terrain: next.terrain?.length ?? 0 }
    const kind = selection.kind
    if (kind === 'bumper' || kind === 'wall' || kind === 'slope' || kind === 'terrain') selection = { kind, index: count[kind] - 1 }
  }
  const pickTool = (t: Tool) => (tool = t)
  const selectOnCanvas = (ref: ElementRef | null) => (selection = ref && hole && exists(hole, ref) ? ref : null)
  /** A row in the lists picks the tool that edits it too: Outline for the corners, else Select. */
  function pickFromList(ref: ElementRef): void {
    tool = ref.kind === 'outline' ? 'outline' : 'select'
    selection = ref
  }

  function onkeydown(e: KeyboardEvent): void {
    if (testPutt || !hole) return
    const t = e.target
    // Typing goes to the field; a focused checkbox or slider still lets the shortcuts through
    const typing =
      t instanceof HTMLInputElement
        ? !['checkbox', 'radio', 'range'].includes(t.type)
        : t instanceof HTMLElement && (t.isContentEditable || ['TEXTAREA', 'SELECT'].includes(t.tagName))
    if (typing) return
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      redo()
    } else if (mod || e.altKey) {
      return
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      remove()
    } else if (e.key === 'Escape') {
      selection = null
    } else {
      const picked = TOOLS.find(x => x.key === e.key.toUpperCase())
      if (picked) tool = picked.id
    }
  }

  function onbeforeunload(e: BeforeUnloadEvent): void {
    if (store?.value && isUnsaved(store.status)) e.preventDefault()
  }

  // The course around the hole: its name, the pager and the strip
  let course = $state<CourseContent | null>(null)
  let rows = $state<HoleRow[]>([])
  $effect(() => {
    const id = courseId
    if (!id || !$currentUser?.isAdmin) return
    untrack(() => {
      void apiLoadCourse(id)
        .then(c => (course = c.value))
        .catch(() => (course = null))
      void api.GET('/api/minigolf/holes').then(res => (rows = res.data?.holes ?? []))
    })
  })
  const holeIds = $derived(course?.holeIds ?? [])
  const at = $derived(holeIds.indexOf(holeId))
  const rowHole = (id: string): Hole | null => {
    if (id === holeId) return hole
    const row = rows.find(r => r.id === id)
    const content = row && holeOf(row)
    return content ? toHole(content) : null
  }
  const holeHref = (id: string) => `#/admin/minigolf/holes/${id}?course=${courseId}`
  const back = $derived(courseId ? `#/admin/minigolf/courses/${courseId}` : '#/admin/minigolf/courses')

  const time = (d: Date | null) => d?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? ''
  const STATUS: Record<DraftStatus, () => string> = {
    loading: () => 'Loading…',
    saving: () => 'Saving…',
    unsaved: () => 'Saving…',
    saved: () => `Saved ${time(store?.savedAt ?? null)}`,
    error: () => (hole ? 'Not saved – retrying' : "Couldn't load this hole"),
    rejected: () => 'Not saved – the server refused this change',
    conflict: () => 'This was changed elsewhere – reload',
    missing: () => 'This hole is gone',
  }
  const hint = $derived(TOOLS.find(t => t.id === tool)?.hint ?? '')
</script>

<svelte:window {onbeforeunload} {onkeydown} />

<Layout title="Hole editor">
  {#if $currentUser?.isAdmin}
    <main class="flex min-h-0 flex-grow flex-col overflow-y-auto">
      <header class="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 md:px-5">
        <a
          href={back}
          class="flex h-10 max-w-[220px] items-center gap-1 rounded-[10px] border border-line-3 pl-2 pr-3 text-[14px] text-ink-2 no-underline"
          ><ChevronLeft size={18} class="shrink-0" /><span class="truncate">{course?.name ?? 'Courses'}</span></a
        >
        {#if courseId && at >= 0}
          <nav aria-label="Holes" class="flex items-center gap-1 text-[13px] label-caps text-text-muted">
            <Button variant="ghost" size="icon" href={holeHref(holeIds[at - 1] ?? '')} disabled={at === 0} aria-label="Previous hole"
              ><ChevronLeft size={18} /></Button
            >
            Hole {at + 1} of {holeIds.length}
            <Button
              variant="ghost"
              size="icon"
              href={holeHref(holeIds[at + 1] ?? '')}
              disabled={at === holeIds.length - 1}
              aria-label="Next hole"><ChevronRight size={18} /></Button
            >
          </nav>
        {/if}
        {#if hole}
          <input
            value={hole.name}
            disabled={readOnly}
            onchange={e => commit({ ...hole, name: e.currentTarget.value })}
            aria-label="Hole name"
            class="h-10 w-[200px] rounded-[10px] border border-line-3 bg-bg px-3 font-display text-[20px] font-bold uppercase text-text outline-none focus-visible:[outline:2px_solid_var(--color-accent)]"
          />
          <div class="flex items-center gap-1 text-[14px] text-text-muted" role="group" aria-label="Par">
            Par
            <Button
              variant="ghost"
              size="icon"
              aria-label="Lower par"
              disabled={hole.par <= 1 || readOnly}
              onclick={() => commit({ ...hole, par: hole.par - 1 })}><Minus size={16} /></Button
            >
            <span class="w-6 text-center font-display text-[20px] font-bold text-text" data-testid="par">{hole.par}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Raise par"
              disabled={readOnly}
              onclick={() => commit({ ...hole, par: hole.par + 1 })}><Plus size={16} /></Button
            >
          </div>
        {/if}
        <span
          title="You can edit official holes"
          class="inline-flex h-6 items-center rounded-[6px] border border-warn-line bg-warn-soft px-2 text-[11px] font-bold uppercase tracking-[0.1em] text-warn"
          >Admin</span
        >
        <div class="ml-auto flex flex-wrap items-center gap-[10px]">
          {#if hole}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Undo (Ctrl+Z)"
              title="Undo (Ctrl+Z)"
              disabled={!canUndo || readOnly}
              onclick={undo}><Undo2 size={18} /></Button
            >
            <Button
              variant="ghost"
              size="icon"
              aria-label="Redo (Ctrl+Shift+Z)"
              title="Redo (Ctrl+Shift+Z)"
              disabled={!canRedo || readOnly}
              onclick={redo}><Redo2 size={18} /></Button
            >
          {/if}
          {#if store}
            <span
              class="text-[13px] {['error', 'rejected', 'conflict'].includes(store.status) ? 'text-live-text' : 'text-text-muted'}"
              aria-live="polite">{STATUS[store.status]()}</span
            >
            {#if store.status === 'conflict' && store}
              {@const s = store}
              <Button variant="outline" onclick={() => void load(s)}>Reload</Button>
            {/if}
          {/if}
          {#if hole}<Button variant="ghost" onclick={() => (testPutt = true)}><Play size={16} />Test putt</Button>{/if}
          <Button variant="accent" class="h-10" href={back}>Done</Button>
        </div>
      </header>

      {#if !store || store.status === 'loading'}
        <p class="m-0 p-5 text-[15px] text-text-muted">Loading…</p>
      {:else if store.status === 'missing'}
        <div role="status" class="m-5 flex flex-col items-start gap-3">
          <p class="m-0 text-[15px]">This hole is gone: someone deleted it.</p>
          <Button variant="outline" href="#/admin/minigolf/courses">Back to the courses</Button>
        </div>
      {:else if !hole}
        {@const s = store}
        <div class="m-5 flex flex-col items-start gap-3">
          <p class="m-0 text-[15px] text-live-text">Couldn't load this hole.</p>
          <Button variant="outline" onclick={() => void load(s)}>Try again</Button>
        </div>
      {:else}
        <div
          class="grid flex-grow gap-4 p-4 md:grid-cols-[56px_minmax(0,1fr)] md:p-5 xl:grid-cols-[56px_minmax(0,1fr)_340px]"
          inert={readOnly}
        >
          <ToolRail {tool} ontool={pickTool} />

          <section aria-label="Canvas" class="flex min-w-0 flex-col gap-3">
            <div class="flex flex-wrap items-center gap-3 text-[13px] text-text-muted">
              <span>{hint}</span>
              <label class="ml-auto flex items-center gap-2">
                <input type="checkbox" bind:checked={heightMap} />
                Show height map
              </label>
            </div>
            <div class="h-[60dvh] min-h-[360px] rounded-2xl bg-bg-deep p-2 xl:h-[calc(100dvh-260px)]">
              <EditorCanvas {hole} {tool} {selection} {options} {heightMap} onselect={selectOnCanvas} oncommit={commit} />
            </div>
            {#if courseId && holeIds.length > 0}
              <ol aria-label="Holes on this course" class="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">
                {#each holeIds as id, i (id)}
                  {@const h = rowHole(id)}
                  <li class="shrink-0">
                    <a
                      href={holeHref(id)}
                      aria-current={id === holeId ? 'page' : undefined}
                      aria-label="Hole {i + 1}{h ? `: ${h.name}` : ''}"
                      class="flex flex-col items-center gap-1 rounded-[10px] border-2 p-1 text-[11px] text-text-muted no-underline
                             {id === holeId ? 'border-accent' : 'border-transparent hover:border-line-3'}"
                    >
                      <span class="pointer-events-none block h-[44px] w-[64px] overflow-hidden rounded-[6px] bg-surface-inset">
                        {#if h}<HoleView hole={h} ball={h.tee} halo={false} />{/if}
                      </span>
                      {i + 1}{h ? ` · par ${h.par}` : ''}
                    </a>
                  </li>
                {/each}
              </ol>
            {/if}
          </section>

          <aside class="flex flex-col gap-5 md:col-span-2 xl:col-span-1">
            <Properties {hole} {tool} {selection} bind:options onedit={commit} onduplicate={duplicate} ondelete={remove} />
            <div class="h-[200px] overflow-hidden rounded-2xl bg-bg-deep" aria-label="3D preview" role="img">
              <!-- Off while Test putt is open: a second WebGL view rendering behind it halves the putt's frame rate -->
              {#if !testPutt}
                {#await import('$lib/components/minigolf/Hole3D.svelte') then { default: Hole3D }}
                  <Hole3D {hole} ball={hole.tee} />
                {/await}
              {/if}
            </div>
            <ElementList {hole} {selection} onselect={pickFromList} />
            <CheckList {checks} onselect={pickFromList} />
          </aside>
        </div>
      {/if}
    </main>
    {#if testPutt && hole}
      <Modal
        title="Test putt"
        onclose={() => (testPutt = false)}
        widthClass="max-w-[min(1800px,96vw)]"
        class="h-[94dvh] max-h-[94dvh] md:h-[94vh] md:max-h-[94vh]"
      >
        <Playtest {hole} physics={DEFAULT_PHYSICS} />
      </Modal>
    {/if}
  {/if}
</Layout>
