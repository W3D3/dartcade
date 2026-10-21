<script lang="ts">
  // The course editor's header: a breadcrumb back to the list, the draft's status, Preview
  // round, Unpublish, Delete, Discard draft and Publish changes, with what refused the last
  // publish listed underneath.
  import { Play, Trash } from '@lucide/svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Breadcrumb } from '$lib/components/ui/breadcrumb/index.js'
  import { minigolfCoursesTrail } from '$lib/admin/breadcrumbs'
  import type { DraftStatus } from '$lib/minigolf/editor/store.svelte'

  let {
    courseId,
    courseName = null,
    status,
    savedAt,
    hasDraft,
    published,
    builtIn = false,
    loaded,
    problems,
    error = null,
    busy = false,
    onpublish,
    ondiscard,
    onunpublish,
    ondelete,
    onreload,
  }: {
    courseId: string | null
    /** The open course's name, for the breadcrumb (null: still loading, or none picked). */
    courseName?: string | null
    status: DraftStatus | null
    savedAt: Date | null
    /** Unpublished changes, the course's own or its holes' (or never published). */
    hasDraft: boolean
    /** Published once: a never-published course has nothing to go back to, so no Discard. */
    published: boolean
    /** Shipped with the code: it can be unpublished, not deleted. */
    builtIn?: boolean
    /** The course's content arrived (a failed first load isn't retried: nothing to save or publish). */
    loaded: boolean
    /** Why the last publish was refused, one line each. */
    problems: string[]
    /** Something else that went wrong (a failed publish, discard or new hole), one line. */
    error?: string | null
    busy?: boolean
    onpublish: () => void
    ondiscard: () => void
    onunpublish: () => void
    ondelete: () => void
    onreload: () => void
  } = $props()

  const time = (d: Date | null) => d?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? ''
  const STATUS: Record<DraftStatus, () => string> = {
    loading: () => 'Loading…',
    saving: () => 'Saving…',
    unsaved: () => 'Saving…',
    saved: () => (hasDraft ? `Draft · saved ${time(savedAt)}` : 'Published · no changes'),
    error: () => (loaded ? 'Not saved – retrying' : "Couldn't load this course"),
    rejected: () => 'Not saved – the server refused this change',
    conflict: () => 'This was changed elsewhere – reload',
    missing: () => 'This course is gone',
  }
  const editable = $derived(
    loaded && (status === 'saved' || status === 'saving' || status === 'unsaved' || status === 'error' || status === 'rejected'),
  )
  const failing = $derived(status === 'error' || status === 'rejected' || status === 'conflict')
</script>

<header class="flex flex-col gap-2 border-b border-line px-4 py-3 md:px-5">
  <Breadcrumb items={minigolfCoursesTrail(courseId ? courseName : null)} />
  <div class="flex flex-wrap items-center gap-3">
    <h1 class="m-0 font-display font-bold text-[24px] uppercase tracking-[0.04em]">Course editor</h1>
    <span
      title="You can edit official courses"
      class="inline-flex h-6 items-center rounded-[6px] border border-warn-line bg-warn-soft px-2 text-[11px] font-bold uppercase tracking-[0.1em] text-warn"
      >Admin</span
    >
    {#if courseId && status}
      <div class="ml-auto flex flex-wrap items-center gap-[10px]">
        <span class="text-[13px] {failing ? 'text-live-text' : 'text-text-muted'}" aria-live="polite">{STATUS[status]()}</span>
        {#if status === 'conflict'}<Button variant="outline" onclick={onreload}>Reload</Button>{/if}
        <Button variant="ghost" href="#/admin/minigolf?course={courseId}&draft=1"><Play size={16} />Preview round</Button>
        {#if published}<Button variant="outline" disabled={busy || !editable} onclick={onunpublish}>Unpublish</Button>{/if}
        {#if !builtIn}<Button variant="ghost" disabled={busy || !loaded} onclick={ondelete}><Trash size={16} />Delete</Button>{/if}
        <Button variant="destructive" disabled={busy || !editable || !hasDraft || !published} onclick={ondiscard}>Discard draft</Button>
        <Button variant="accent" class="h-10" disabled={busy || !editable} onclick={onpublish}>Publish changes</Button>
      </div>
    {/if}
  </div>
  {#if problems.length > 0 || error}
    <div role="alert" class="rounded-[10px] border border-live-text/50 bg-live-soft px-3 py-2 text-[14px]">
      {#if error}<p class="m-0 font-semibold text-live-text">{error}</p>{/if}
      {#if problems.length > 0}
        <p class="m-0 font-semibold text-live-text">Not published. Fix these first:</p>
        <ul class="m-0 mt-1 pl-5">
          {#each problems as line (line)}<li>{line}</li>{/each}
        </ul>
      {/if}
    </div>
  {/if}
</header>
