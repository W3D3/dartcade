// The course and hole editors' data (Task 9/10 build the pages on this): load a draft, apply
// edits at once, autosave them debounced with the row's version, and expose a status the page
// renders. A 409 means someone else changed it meanwhile (conflict: edits stop until a reload);
// a 404 means it's gone (missing); another 4xx can't succeed by retrying (rejected: only the next
// edit tries again); anything else (offline, 5xx) retries with backoff, saving the latest edit.
import { api } from '$lib/api'
import type { components } from '$lib/api/schema'
import { holeSchema } from '$shared/minigolf/holeSchema'
import type { Hole } from '$shared/minigolf/types'

type ApiHole = components['schemas']['MinigolfHole']
export type CourseContent = components['schemas']['MinigolfCourseContent']
export type PublishProblem = components['schemas']['MinigolfPublishProblem']

export type DraftStatus = 'loading' | 'saved' | 'saving' | 'unsaved' | 'error' | 'rejected' | 'conflict' | 'missing'

/** Thrown by the network calls below; the store tells a conflict (409) and a deletion (404)
 *  apart from any other failure by this. */
export class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`)
  }
}

// A Hole is the API's MinigolfHole with readonly points; the generated type has plain number[]
// (the same JSON), so a hole comes in through holeSchema (which checks it) and goes out cast.
/** The API's hole as the editor's Hole (ops.ts, history.ts). */
export const toHole = (h: ApiHole): Hole => holeSchema.parse(h)
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the same JSON, only Pt's readonly differs
const fromHole = (h: Hole) => h as unknown as ApiHole

type Loaded<T> = { value: T; version: number; updatedAt: string }
type Saved = { version: number; updatedAt: string }

export async function apiLoadHole(id: string): Promise<Loaded<Hole>> {
  const res = await api.GET('/api/minigolf/holes/{id}', { params: { path: { id } } })
  if (res.error) throw new HttpError(res.response.status)
  const content = res.data.draft ?? res.data.published
  if (!content) throw new HttpError(404)
  return { value: toHole(content), version: res.data.version, updatedAt: res.data.updatedAt }
}

export async function apiSaveHole(id: string, version: number, hole: Hole): Promise<Saved> {
  const res = await api.PATCH('/api/minigolf/holes/{id}', { params: { path: { id } }, body: { version, hole: fromHole(hole) } })
  if (res.error) throw new HttpError(res.response.status)
  return { version: res.data.version, updatedAt: res.data.updatedAt }
}

export async function apiLoadCourse(id: string): Promise<Loaded<CourseContent>> {
  const res = await api.GET('/api/minigolf/courses/{id}', { params: { path: { id } } })
  if (res.error) throw new HttpError(res.response.status)
  const content = res.data.draft ?? res.data.published
  if (!content) throw new HttpError(404)
  return { value: content, version: res.data.version, updatedAt: res.data.updatedAt }
}

export async function apiSaveCourse(id: string, version: number, content: CourseContent): Promise<Saved> {
  const res = await api.PATCH('/api/minigolf/courses/{id}', { params: { path: { id } }, body: { version, content } })
  if (res.error) throw new HttpError(res.response.status)
  return { version: res.data.version, updatedAt: res.data.updatedAt }
}

/** Publishes the course's current draft; the failing checks (or null on success). */
export async function apiPublishCourse(id: string): Promise<PublishProblem[] | null> {
  const res = await api.POST('/api/minigolf/courses/{id}/publish', { params: { path: { id } } })
  if (res.error && 'problems' in res.error) return res.error.problems
  if (res.error) throw new HttpError(res.response.status)
  return null
}

export async function apiDiscardCourse(id: string): Promise<void> {
  const res = await api.POST('/api/minigolf/courses/{id}/discard', { params: { path: { id } } })
  if (res.error) throw new HttpError(res.response.status)
}

const BACKOFF_MS = [1000, 2000, 5000, 10000]

/** A save failure that retrying can't fix (a 4xx other than a timeout or rate limit). */
const hopeless = (status: number) => status >= 400 && status < 500 && status !== 408 && status !== 429

/** Shared by `createHoleStore` and `createCourseStore`: load, edit-and-autosave, retry. */
function createDraftStore<T>(
  id: string,
  load: (id: string) => Promise<Loaded<T>>,
  save: (id: string, version: number, value: T) => Promise<Saved>,
  delayMs: number,
) {
  let value = $state<T | null>(null)
  let status = $state<DraftStatus>('loading')
  let savedAt = $state<Date | null>(null)
  let version = 0
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retryStep = 0
  // While a publish or discard is out, autosave waits (`hold`), so no save races it
  let held = false
  // The save in flight, if any; `doSave` returns it instead of starting a second request, and
  // `flush` awaits it so it settles before the page navigates or publishes.
  let inFlight: Promise<void> | null = null

  function doSave(): Promise<void> {
    if (!inFlight) inFlight = run()
    return inFlight
  }

  async function run(): Promise<void> {
    const started = value
    if (started === null) {
      inFlight = null
      return
    }
    status = 'saving'
    try {
      const res = await save(id, version, started)
      version = res.version
      savedAt = new Date(res.updatedAt)
      retryStep = 0
      inFlight = null
      if (value !== started) {
        // Edited again while this save was in flight: save the latest right away.
        status = 'unsaved'
        await doSave()
      } else {
        status = 'saved'
      }
    } catch (e) {
      inFlight = null
      if (e instanceof HttpError && e.status === 409) {
        status = 'conflict'
        return
      }
      if (e instanceof HttpError && e.status === 404) {
        status = 'missing'
        return
      }
      if (e instanceof HttpError && hopeless(e.status)) {
        status = 'rejected'
        return
      }
      status = 'error'
      const wait = BACKOFF_MS[Math.min(retryStep, BACKOFF_MS.length - 1)]
      retryStep++
      retryTimer = setTimeout(() => void doSave(), wait)
    }
  }

  function schedule(): void {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (status === 'unsaved' && !held) void doSave()
    }, delayMs)
  }

  return {
    get value() {
      return value
    },
    get status() {
      return status
    },
    get savedAt() {
      return savedAt
    },
    async load(): Promise<void> {
      clearTimeout(saveTimer)
      clearTimeout(retryTimer)
      saveTimer = undefined
      retryTimer = undefined
      retryStep = 0
      status = 'loading'
      try {
        const res = await load(id)
        value = res.value
        version = res.version
        savedAt = new Date(res.updatedAt)
        status = 'saved'
      } catch (e) {
        // What was shown is stale (a reload after a conflict) or never came: the page offers Try again
        value = null
        status = e instanceof HttpError && e.status === 404 ? 'missing' : 'error'
      }
    },
    edit(v: T): void {
      // After a conflict or a deletion elsewhere, edits stop until a reload (they could never save)
      if (status === 'conflict' || status === 'missing') return
      value = v
      // A retry in backoff keeps its own schedule and picks up this value when it next runs
      if (status === 'error') return
      status = 'unsaved'
      schedule()
    },
    async flush(): Promise<void> {
      clearTimeout(saveTimer)
      saveTimer = undefined
      if (status === 'conflict' || status === 'missing' || status === 'rejected' || status === 'saved' || status === 'loading') return
      clearTimeout(retryTimer)
      retryTimer = undefined
      retryStep = 0
      await doSave()
    },
    /** Cancels the pending debounce/retry timer without saving, and waits out a save already in
     *  flight. For discard, which must drop local edits rather than persist them. */
    async stopAutosave(): Promise<void> {
      clearTimeout(saveTimer)
      clearTimeout(retryTimer)
      saveTimer = undefined
      retryTimer = undefined
      if (inFlight) await inFlight
    },
    /** Runs `fn` (a publish or discard) with autosave held; an edit made meanwhile saves after. */
    async hold<R>(fn: () => Promise<R>): Promise<R> {
      held = true
      try {
        return await fn()
      } finally {
        held = false
        if (status === 'unsaved') schedule()
      }
    },
  }
}

export const createHoleStore = (id: string, save = apiSaveHole, load = apiLoadHole, delayMs = 800) =>
  createDraftStore<Hole>(id, load, save, delayMs)

export function createCourseStore(
  id: string,
  save = apiSaveCourse,
  load = apiLoadCourse,
  delayMs = 800,
  publish = apiPublishCourse,
  discard = apiDiscardCourse,
) {
  const store = createDraftStore<CourseContent>(id, load, save, delayMs)
  return {
    get content() {
      return store.value
    },
    get status() {
      return store.status
    },
    get savedAt() {
      return store.savedAt
    },
    load: () => store.load(),
    edit: (c: CourseContent) => store.edit(c),
    flush: () => store.flush(),
    /** Flushes any pending save first, then publishes. Returns: the failing checks; null once
     *  published (after which it reloads to pick up the new version, keeping anything typed
     *  meanwhile as a new edit on top); or `{ notSaved: status }` without publishing or
     *  reloading, when the flush didn't end up `saved` (a conflict, a deletion, or a save that's
     *  still failing) — publishing would otherwise ship the server's stale draft and then
     *  overwrite the admin's unsaved edits. */
    async publish(): Promise<PublishProblem[] | null | { notSaved: DraftStatus }> {
      await store.flush()
      if (store.status !== 'saved') return { notSaved: store.status }
      const sent = store.value
      const problems = await store.hold(() => publish(id))
      if (problems) return problems
      const typed = store.value !== sent ? store.value : null
      await store.load()
      // A failed reload leaves nothing to edit on top of (the page offers Try again)
      if (typed && store.value !== null) store.edit(typed)
      return null
    },
    async discard(): Promise<void> {
      await store.stopAutosave()
      await store.hold(() => discard(id))
      await store.load()
    },
  }
}
