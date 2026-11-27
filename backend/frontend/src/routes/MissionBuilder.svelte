<!--
  The mission builder (`#/play/missions/new`, `#/play/missions/:id/edit`; Mission-Builder,
  Tablet-Mission-Builder and Mission-Builder-Phone artboards): Details, Steps and Rules & sharing,
  the live Preview, Save mission and Test it first. `?from=<id>` starts a new mission as a copy.
  Changes nobody saved are kept on this device until they are saved or discarded. Behind
  missions.enabled.
-->
<script lang="ts">
  import { ChevronLeft, Play, Save } from '@lucide/svelte'
  import { tick, untrack } from 'svelte'
  import { push, querystring } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import LoadingBlock from '$lib/components/LoadingBlock.svelte'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import FormSection from '$lib/components/tournaments/FormSection.svelte'
  import SwitchRow from '$lib/components/tournaments/SwitchRow.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import AddStep from '$lib/components/missions/builder/AddStep.svelte'
  import BuilderPreview from '$lib/components/missions/builder/BuilderPreview.svelte'
  import Choice from '$lib/components/missions/builder/Choice.svelte'
  import NumberField from '$lib/components/missions/builder/NumberField.svelte'
  import StepCard from '$lib/components/missions/builder/StepCard.svelte'
  import { sortable, type SortableDrop } from '$lib/actions/sortable'
  import type { Direction } from '$lib/lobby/dnd'
  import { currentUser } from '$lib/auth'
  import { flag, flagsLoaded } from '$lib/flags'
  import { isPhone } from '$lib/viewport'
  import { hrefs } from '$lib/routes'
  import { deleteMission } from '$lib/missions/api'
  import {
    clearDraft,
    duplicateStep,
    checkedSteps,
    formErrors,
    formSnapshot,
    fromMission,
    keyed,
    LIMIT_PRESETS,
    loadCard,
    moveStep,
    newStepErrors,
    newForm,
    ON_FAIL_HELP,
    ORDER_HELP,
    readDraft,
    saveMission,
    shiftStep,
    startTestRun,
    stepErrors,
    storeDraft,
    toMission,
    VISIBILITY_HELP,
    type BuilderForm,
    type FieldErrors,
    type LimitChoice,
  } from '$lib/missions/builder'
  import { DIFFICULTIES, DIFFICULTY_LABEL, VISIBILITIES, VISIBILITY_LABEL, type MissionCard } from '$lib/missions/view'
  import { suggestDifficulty } from '$shared/missions/difficulty'
  import { MISSION_LIMITS, type Step } from '$shared/missions/types'

  let { params = {} }: { params?: { id?: string } } = $props()

  const enabled = flag('missions.enabled')
  $effect(() => {
    if ($flagsLoaded && !$enabled) void push('/')
  })

  const id = $derived(params.id ?? null)
  const from = $derived(new URLSearchParams($querystring ?? '').get('from'))
  /** The mission being edited; undefined while it loads, null if it isn't there. */
  let card = $state<MissionCard | null | undefined>(undefined)
  /** The mission the form started from: the one edited or copied. */
  let source = $state<MissionCard | null>(null)
  let form = $state<BuilderForm>(newForm())
  /** The form as last saved (or as it started), to tell unsaved changes. */
  let baseline = $state('')
  let loaded = $state(false)
  let restored = $state(false)
  let tried = $state(false)
  let busy = $state(false)
  let notice = $state('')
  let serverErrors = $state<FieldErrors>(new Map())
  let openKey = $state<string | null>(null)
  let adding = $state(false)
  let deleting = $state(false)
  let moved = $state('')

  $effect(() => {
    if (!$enabled) return
    const [editId, copyId] = [id, from]
    // Only the route and the flag start a load: with nothing to fetch it runs synchronously
    untrack(() => void load(editId, copyId))
  })

  async function load(editId: string | null, copyId: string | null) {
    loaded = false
    const wanted = editId ?? copyId
    const found = wanted ? await loadCard(wanted) : null
    if (editId !== id) return
    card = editId ? found : null
    source = found
    const start = startOf()
    const draft = readDraft({ id: editId, from: copyId })
    baseline = formSnapshot(start)
    form = draft ?? start
    restored = draft !== null && formSnapshot(draft) !== baseline
    openKey = null
    adding = form.steps.length === 0
    loaded = true
  }

  function startOf(): BuilderForm {
    if (!source) return newForm()
    if (id) return fromMission(source.mission, source.visibility, source.official)
    return fromMission({ ...source.mission, name: `Copy of ${source.mission.name}`.slice(0, MISSION_LIMITS.name) }, 'friends', false)
  }

  const draftOf = $derived({ id, from })
  const editing = $derived(id !== null)
  const official = $derived(form.official)
  // Official on an existing mission changes who it belongs to, so it asks first
  let confirmOfficial = $state<boolean | null>(null)
  // Re-mounts the switch when the question is cancelled, so it shows the form again
  let switchKey = $state(0)
  const dirty = $derived(loaded && formSnapshot(form) !== baseline)
  $effect(() => {
    if (!loaded) return
    if (dirty) storeDraft(draftOf, form)
    else clearDraft(draftOf)
  })

  const errors = $derived.by(() => {
    const e = formErrors(form)
    for (const [k, v] of serverErrors) if (!e.has(k)) e.set(k, v)
    // A new mission's empty name isn't wrong until it is saved
    if (!tried && !form.name.trim()) e.delete('name')
    return e
  })
  const mission = $derived(toMission(form))
  const checked = $derived(checkedSteps(form, errors))
  const valid = $derived(checked.filter(s => s !== null))
  const suggested = $derived(
    valid.length > 0 ? suggestDifficulty({ steps: valid, onFail: form.onFail, timeLimit: mission.timeLimit }) : null,
  )
  const author = $derived(official ? 'Dartcade' : (card?.author?.name ?? $currentUser?.name ?? 'you'))
  const full = $derived(form.steps.length >= MISSION_LIMITS.steps)

  const set = <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => {
    form[key] = value
    serverErrors = new Map()
  }

  const LIMITS: { value: LimitChoice; label: string }[] = [
    { value: 'none', label: 'None' },
    ...LIMIT_PRESETS.map(s => ({ value: s, label: `${s / 60}m` })),
    { value: 'custom', label: 'Custom' },
  ]

  // ── Steps ──

  function ondrop(d: SortableDrop) {
    set('steps', moveStep(form.steps, d.id, d.beforeId))
  }
  function onkey(key: string, dir: Direction) {
    if (dir !== 'up' && dir !== 'down') return
    set('steps', shiftStep(form.steps, key, dir === 'up' ? -1 : 1))
    moved = `Step moved to place ${form.steps.findIndex(s => s.key === key) + 1} of ${form.steps.length}.`
  }
  async function addStep(step: Step) {
    const s = keyed(step)
    set('steps', [...form.steps, s])
    openKey = s.key
    await tick()
    document.querySelector<HTMLElement>(`[data-sortable-id="${s.key}"] [aria-expanded]`)?.focus()
  }

  // ── Saving ──

  /** Checks and saves; the saved card, or null with the problems shown. */
  async function save(): Promise<MissionCard | null> {
    tried = true
    notice = ''
    const problems = formErrors(form)
    if (problems.size > 0) {
      const bad = form.steps.findIndex((_, i) => stepErrors(problems, i).size > 0)
      if (bad >= 0) openKey = form.steps[bad].key
      notice = 'Some fields need a look.'
      await tick()
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return null
    }
    busy = true
    const res = await saveMission(form, id, source?.official ?? false)
    busy = false
    if ('error' in res) {
      serverErrors = res.fields
      notice = res.error
      return null
    }
    clearDraft(draftOf)
    baseline = formSnapshot(form)
    return res.ok
  }

  async function saveAndLeave() {
    if (await save()) void push(hrefs.missions('mine').slice(1))
  }

  async function testRun() {
    const saved = await save()
    if (!saved) return
    busy = true
    const res = await startTestRun(saved.id)
    busy = false
    if ('ok' in res) void push(`/session/${res.ok}`)
    else {
      // Saved, so the next try edits it rather than making another
      if (!editing) void push(hrefs.missionEdit(saved.id).slice(1))
      notice = res.error
    }
  }

  async function remove() {
    deleting = false
    if (!id) return
    const res = await deleteMission(id)
    if ('error' in res) return void (notice = res.error)
    clearDraft(draftOf)
    baseline = formSnapshot(form)
    void push(hrefs.missions('mine').slice(1))
  }

  function discard() {
    clearDraft(draftOf)
    form = startOf()
    baseline = formSnapshot(form)
    restored = false
    tried = false
  }

  function onbeforeunload(e: BeforeUnloadEvent) {
    if (dirty) e.preventDefault()
  }
</script>

<svelte:window {onbeforeunload} />

<Layout title={editing ? 'Edit mission' : 'New mission'}>
  <main class="flex min-h-0 grow flex-col gap-4 overflow-y-auto p-4 md:gap-[22px] md:px-8 md:py-10 xl:px-11">
    <a href={hrefs.missions()} class="inline-flex w-fit items-center gap-1.5 text-label font-semibold text-text no-underline">
      <ChevronLeft size={16} />Missions
    </a>
    <h1 class="type-page-title">{editing ? 'Edit mission' : 'New mission'}</h1>

    {#if !$flagsLoaded || (!loaded && $enabled)}
      <LoadingBlock onretry={() => void load(id, from)} />
    {:else if !$enabled}
      <p class="text-body text-text-muted">Missions aren't available yet.</p>
    {:else if editing && !card}
      <p class="text-body text-text-muted">This mission isn't there anymore.</p>
    {:else if editing && !card?.canEdit}
      <p class="text-body text-text-muted">Only its author can edit this mission.</p>
    {:else}
      {#if restored}
        <p
          role="status"
          class="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-1 px-3.5 py-2.5 text-label text-text-muted"
        >
          Your unsaved changes are back.
          <button type="button" class="cursor-pointer border-0 bg-transparent p-0 font-semibold text-accent underline" onclick={discard}
            >Discard them</button
          >
        </p>
      {/if}
      {#if card?.hidden}
        <p class="rounded-md border border-danger-line bg-live-soft px-3.5 py-2.5 text-label text-danger-text">
          Hidden by a moderator: {card.hidden.reason}
        </p>
      {/if}
      <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div class="flex min-w-0 flex-col gap-4">
          <FormSection n={1} title="Details">
            <div class="grid gap-3.5 md:grid-cols-2">
              <div class="flex min-w-0 flex-col gap-1.5">
                <label for="mb-name" class="text-label font-semibold">Name</label>
                <Input
                  id="mb-name"
                  value={form.name}
                  maxlength={MISSION_LIMITS.name}
                  placeholder="e.g. Tungsten Gauntlet"
                  aria-invalid={errors.has('name') ? 'true' : undefined}
                  aria-describedby={errors.has('name') ? 'mb-name-error' : undefined}
                  oninput={(e: Event & { currentTarget: HTMLInputElement }) => set('name', e.currentTarget.value)}
                />
                {#if errors.get('name')}<span id="mb-name-error" class="text-caption text-danger-text">{errors.get('name')}</span>{/if}
              </div>
              <div class="flex min-w-0 flex-col gap-1.5">
                <Choice
                  label="Difficulty"
                  options={DIFFICULTIES.map(d => ({ value: d, label: DIFFICULTY_LABEL[d] }))}
                  value={form.difficulty}
                  onchange={(v: BuilderForm['difficulty']) => set('difficulty', v)}
                />
                {#if suggested}
                  <span class="text-caption text-text-dim" aria-live="polite"
                    >We suggest <b class="text-text">{DIFFICULTY_LABEL[suggested]}</b> from your steps.</span
                  >
                {/if}
              </div>
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="mb-description" class="text-label font-semibold"
                >Description <span class="font-normal text-text-dim">· optional</span></label
              >
              <textarea
                id="mb-description"
                value={form.description}
                maxlength={MISSION_LIMITS.description}
                rows="2"
                aria-invalid={errors.has('description') ? 'true' : undefined}
                aria-describedby={errors.has('description') ? 'mb-description-error' : undefined}
                oninput={(e: Event & { currentTarget: HTMLTextAreaElement }) => set('description', e.currentTarget.value)}
                class="min-h-[60px] resize-y rounded-md border border-line-3 bg-surface-2 px-4 py-3 text-base text-text
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"></textarea>
              {#if errors.get('description')}<span id="mb-description-error" class="text-caption text-danger-text"
                  >{errors.get('description')}</span
                >{/if}
            </div>
            <div class="grid gap-3.5 md:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
              <Choice
                label="Step order"
                options={[{ value: 'any', label: 'Any order' } as const, { value: 'in_order', label: 'In order' } as const]}
                value={form.order}
                onchange={(v: BuilderForm['order']) => set('order', v)}
              />
              <Choice
                label="Time limit"
                options={LIMITS}
                value={form.limit}
                error={form.limit === 'custom' ? undefined : errors.get('timeLimit')}
                onchange={(v: LimitChoice) => set('limit', v)}
              />
            </div>
            {#if form.limit === 'custom'}
              <div class="flex items-start gap-2.5 md:ml-auto">
                <div class="w-[120px]">
                  <NumberField
                    label="Minutes"
                    unit="min"
                    value={form.customMinutes}
                    onchange={(v: number | undefined) => set('customMinutes', v ?? NaN)}
                  />
                </div>
                <div class="w-[120px]">
                  <NumberField
                    label="Seconds"
                    unit="sec"
                    value={form.customSeconds}
                    onchange={(v: number | undefined) => set('customSeconds', v ?? NaN)}
                  />
                </div>
              </div>
              {#if errors.get('timeLimit')}<span class="text-caption text-danger-text md:text-right"
                  >Time limit: {errors.get('timeLimit')} seconds</span
                >{/if}
            {/if}
            <span class="text-caption text-text-dim"
              >{ORDER_HELP[form.order]}{form.limit === 'none' ? '' : ' The clock starts when you press Start.'}</span
            >
          </FormSection>

          <FormSection n={2} title="Steps">
            {#if form.steps.length > 0}
              <span class="-mt-2 text-small text-text-muted"
                >{form.steps.length} {form.steps.length === 1 ? 'step' : 'steps'} · drag the handle or use the arrow keys to reorder</span
              >
              <div class="flex flex-col gap-2" data-sortable-zone="steps" use:sortable={{ ondrop, onkey }}>
                {#each form.steps as s, i (s.key)}
                  <StepCard
                    key={s.key}
                    n={i + 1}
                    bind:step={s.step}
                    errors={stepErrors(errors, i)}
                    open={openKey === s.key}
                    ontoggle={() => (openKey = openKey === s.key ? null : s.key)}
                    onduplicate={full ? undefined : () => set('steps', duplicateStep(form.steps, s.key))}
                    onremove={() =>
                      set(
                        'steps',
                        form.steps.filter(x => x.key !== s.key),
                      )}
                  />
                {/each}
              </div>
              <span class="sr-only" aria-live="polite">{moved}</span>
            {/if}
            {#if errors.get('steps')}<span class="text-caption text-danger-text">{errors.get('steps')}</span>{/if}
            {#if full}
              <span class="text-caption text-text-dim">{MISSION_LIMITS.steps} steps is the most a mission can have.</span>
            {:else}
              <AddStep n={form.steps.length + 1} bind:open={adding} errorsOf={newStepErrors} onadd={(step: Step) => void addStep(step)} />
            {/if}
          </FormSection>

          <FormSection n={3} title="Rules & sharing">
            <div class="grid gap-3.5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <Choice
                label="If a step fails"
                options={[{ value: 'retry', label: 'Retry that step' } as const, { value: 'restart', label: 'Start over' } as const]}
                value={form.onFail}
                onchange={(v: BuilderForm['onFail']) => set('onFail', v)}
              />
              <Choice
                label="Pause"
                options={[
                  { value: false, label: 'Not allowed' },
                  { value: true, label: 'Allowed' },
                ]}
                value={form.pause}
                onchange={(v: boolean) => set('pause', v)}
              />
            </div>
            <span class="text-caption {form.onFail === 'restart' ? 'text-clock' : 'text-text-dim'}">{ON_FAIL_HELP[form.onFail]}</span>
            <div class="h-px bg-surface-chip"></div>
            {#if $currentUser?.isAdmin}
              {#key switchKey}
                <SwitchRow
                  id="mb-official"
                  label="Official mission (by Dartcade)"
                  help="Everyone can play it and it shows as by Dartcade. Only admins see this."
                  checked={form.official}
                  onchange={(on: boolean) => (editing ? (confirmOfficial = on) : set('official', on))}
                />
              {/key}
            {/if}
            {#if official}
              <Choice label="Who can play it" options={[{ value: 'public', label: 'Everyone' }]} value="public" onchange={() => {}} />
              <span class="text-caption text-text-dim">An official mission is always everyone's. Turn Official off to choose.</span>
            {:else}
              <Choice
                label="Who can play it"
                options={VISIBILITIES.map(v => ({ value: v, label: VISIBILITY_LABEL[v] }))}
                value={form.visibility}
                onchange={(v: BuilderForm['visibility']) => set('visibility', v)}
              />
              <span class="text-caption text-text-dim">{VISIBILITY_HELP[form.visibility]}</span>
            {/if}
          </FormSection>
        </div>

        <aside class="flex min-w-0 flex-col gap-4 lg:sticky lg:top-0">
          <section class="card flex flex-col gap-3 p-[18px]" aria-label="Preview">
            {#if $isPhone}
              <details class="group">
                <summary class="cursor-pointer text-caption font-semibold label-caps text-text-dim">Preview</summary>
                <div class="mt-3"><BuilderPreview {mission} {author} {official} {checked} /></div>
              </details>
            {:else}
              <span class="text-caption font-semibold label-caps text-text-dim">Preview</span>
              <BuilderPreview {mission} {author} {official} {checked} />
            {/if}
          </section>
          <div class="flex flex-col gap-2.5 {$isPhone ? 'sticky bottom-0 -mx-4 border-t border-line bg-bg px-4 py-3' : ''}">
            {#if notice}<p role="status" class="text-label {notice.startsWith('Some') ? 'text-danger-text' : 'text-text-muted'}">
                {notice}
              </p>{/if}
            <div class="flex flex-col gap-2.5 {$isPhone ? 'flex-row-reverse' : ''}">
              <Button variant="accent" class="h-[50px] {$isPhone ? 'flex-2' : ''}" disabled={busy} onclick={() => void saveAndLeave()}
                ><Save size={18} />Save mission</Button
              >
              <Button variant="outline" class="h-[50px] {$isPhone ? 'flex-1' : ''}" disabled={busy} onclick={() => void testRun()}
                ><Play size={18} />{$isPhone ? 'Test' : 'Test it first'}</Button
              >
            </div>
            {#if !$isPhone}<span class="text-center text-caption text-text-dim">Test runs don’t count for times or stats.</span>{/if}
            {#if editing}
              <Button variant="destructive" class="w-full" disabled={busy} onclick={() => (deleting = true)}>Delete mission</Button>
            {/if}
          </div>
        </aside>
      </div>
    {/if}
  </main>
</Layout>

{#if confirmOfficial !== null}
  <ConfirmModal
    title={confirmOfficial ? 'Make this mission official?' : 'Make this mission yours again?'}
    body={confirmOfficial
      ? 'Everyone sees it as by Dartcade, with the official XP and achievement rules. It is no longer tied to you, and everyone can play it.'
      : 'It becomes your own mission, and you choose who can play it. It no longer shows as by Dartcade.'}
    confirmLabel={confirmOfficial ? 'Make official' : 'Make it mine'}
    onconfirm={() => {
      set('official', confirmOfficial === true)
      confirmOfficial = null
    }}
    oncancel={() => {
      confirmOfficial = null
      switchKey++
    }}
  />
{/if}

{#if deleting}
  <ConfirmModal
    title="Delete {card?.mission.name}?"
    body="Its highscores go with it. This can't be undone."
    confirmLabel="Delete"
    cancelLabel="Keep it"
    danger
    onconfirm={() => void remove()}
    oncancel={() => (deleting = false)}
  />
{/if}
