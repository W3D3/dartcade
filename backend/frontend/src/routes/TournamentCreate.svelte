<script lang="ts">
  // Create a tournament (Tournament-Create), or edit one you organize (`#/tournaments/:id/edit`):
  // Basics, Game, Entry, Format, Schedule & rules, and a live Preview with the save buttons. Behind
  // tournaments.enabled; creating also needs tournaments.community.enabled (admins always may).
  // In person, the Participants and the paired boards. Guests (#612) come with their ticket.
  import { ChevronLeft } from '@lucide/svelte'
  import { querystring, replace } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import PageLoading from '$lib/components/PageLoading.svelte'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import AvgLimitSection from '$lib/components/tournaments/AvgLimitSection.svelte'
  import CreatePreview from '$lib/components/tournaments/CreatePreview.svelte'
  import InPersonBoards from '$lib/components/tournaments/InPersonBoards.svelte'
  import ParticipantsSection from '$lib/components/tournaments/ParticipantsSection.svelte'
  import FormSection from '$lib/components/tournaments/FormSection.svelte'
  import OrganizersField from '$lib/components/tournaments/OrganizersField.svelte'
  import OptionCards from '$lib/components/tournaments/OptionCards.svelte'
  import DateTimeField from '$lib/components/tournaments/DateTimeField.svelte'
  import SwitchRow from '$lib/components/tournaments/SwitchRow.svelte'
  import { DatePicker } from '$lib/components/ui/date-picker/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Select } from '$lib/components/ui/select/index.js'
  import { currentUser } from '$lib/auth'
  import { flag, flagsLoaded } from '$lib/flags'
  import { hrefs } from '$lib/routes'
  import {
    ACCESS,
    ACCESS_HELP,
    CHECK_IN_AFTER,
    CRICKET_MODES,
    ENTRY,
    FIRST_TO,
    GROUP_SIZES,
    NO_SHOW_WAIT,
    OUT_MODES,
    PLAYERS_PER_TEAM,
    SEEDING,
    START_SCORES,
    THROUGH,
    FORMATS,
    GAMES,
    LONGER_FINAL_DISABLED,
    ORGANIZER_START_DISABLED,
    CHECK_IN_BEFORE,
    REGISTRATION_CLOSES,
    TEAM_PLAY,
    checkInBeforeOf,
    checkInChoices,
    defaultForm,
    finalChoices,
    finalFirstToOf,
    formProblems,
    fromTournament,
    loadTournament,
    matchLengthLine,
    maxEntriesOf,
    previewOf,
    saveTournament,
    sizeChoices,
    startModeOf,
    toInput,
    type Choice,
    type CreateForm,
    type Tournament,
  } from '$lib/tournaments/create'
  import { addPicked, type OrganizerPick } from '$lib/tournaments/organizers'
  import { draftProblems, emptyDraft, fromParticipants, loadParticipants, toBody } from '$lib/tournaments/participants'
  import { TOURNAMENT_TEXT } from '$shared/tournaments/setup'
  import { isEditable } from '$shared/tournaments/state'

  let { params = {} }: { params?: { id?: string } } = $props()

  const enabled = flag('tournaments.enabled')
  const community = flag('tournaments.community.enabled')
  const mayCreate = $derived(!!$currentUser?.isAdmin || $community)

  let form = $state<CreateForm>(defaultForm(new Date()))
  /** The stored tournament in edit mode; undefined while it loads, null if it isn't there. */
  let stored = $state<Tournament | null | undefined>(undefined)
  let busy = $state(false)
  let errors = $state<string[]>([])
  /** Organizers picked for a tournament that is not saved yet. */
  let organizers = $state<OrganizerPick[]>([])
  let participants = $state(emptyDraft())

  $effect(() => {
    const id = params.id
    if (!id) return
    stored = undefined
    void loadTournament(id).then(t => {
      stored = t
      if (t) form = fromTournament(t, new Date())
      if (t?.access === 'in_person' && t.role) void loadParticipants(t.id).then(p => p && (participants = fromParticipants(p, t.teamSize)))
    })
  })

  const editing = $derived(!!params.id)
  /** Started (check-in included): nothing changes anymore. */
  const started = $derived(!!stored && !isEditable(stored.status))
  /** Someone registered for an online tournament: only the start time, its settings and the description can change. */
  const registered = $derived(stored?.locked ?? false)
  const locked = $derived(registered || started)
  const draft = $derived(!editing || stored?.status === 'draft')
  const inPerson = $derived(form.access === 'in_person')
  const startMode = $derived(startModeOf(form))
  const preview = $derived(previewOf(form))
  const perTeam = $derived(toInput(form).teamSize)
  const problems = $derived([
    ...formProblems(form, new Date()),
    ...(inPerson ? draftProblems(participants, perTeam, maxEntriesOf(form)) : []),
    ...(started ? ['The tournament has started, so it can’t change anymore.'] : []),
  ])
  const owner = $derived((editing ? stored?.owner?.name : $currentUser?.name) ?? 'you')
  const saved = $derived(new URLSearchParams($querystring ?? '').get('saved'))

  const primary = $derived(!editing ? preview.primary : !draft ? 'Save changes' : inPerson ? 'Save & publish' : 'Save & open registration')

  const seg = <T>(choices: Choice<T>[]) => choices.map(c => ({ value: c.value, label: c.label, disabled: !!c.disabled, title: c.disabled }))
  /** The reasons the disabled choices give, once each. */
  const reasons = (choices: Choice<unknown>[]) => [...new Set(choices.flatMap(c => (c.disabled ? [c.disabled] : [])))]

  const set = <K extends keyof CreateForm>(key: K, value: CreateForm[K]) => {
    form[key] = value
    errors = []
  }

  async function save(publish: boolean) {
    busy = true
    const res = await saveTournament(toInput(form), {
      id: params.id,
      publish,
      participants: inPerson ? toBody(participants, perTeam) : undefined,
    })
    if (!res.ok) errors = res.errors
    // Still busy while the picks are added: a second click would make a second tournament
    if (res.id && !params.id && organizers.length > 0) {
      errors = [...errors, ...(await addPicked(res.id, organizers))]
      organizers = []
    }
    busy = false
    if (!res.id) return
    // A new tournament (even one whose publish failed) is edited from now on, so a retry saves it
    if (res.id !== params.id) return void replace(hrefs.tournamentEdit(res.id, res.ok ? 'saved=1' : undefined).slice(1))
    if (!res.ok) return
    stored = (await loadTournament(res.id)) ?? stored
    void replace(hrefs.tournamentEdit(res.id, 'saved=1').slice(1))
  }

  const statusLine = $derived(
    !stored
      ? ''
      : stored.status === 'draft'
        ? 'Draft: only organizers see it.'
        : stored.status === 'open'
          ? inPerson
            ? 'Published.'
            : 'Registration is open.'
          : 'This tournament has started.',
  )
</script>

<Layout title={editing ? 'Edit tournament' : 'Create tournament'}>
  <main class="flex min-h-0 grow flex-col gap-4 overflow-y-auto p-4 md:gap-[22px] md:px-8 md:py-10 xl:px-11">
    <a href={hrefs.tournaments('mine')} class="inline-flex w-fit items-center gap-1.5 text-label font-semibold text-text no-underline">
      <ChevronLeft size={16} />Tournaments
    </a>
    <h1 class="type-page-title">{editing ? 'Edit tournament' : 'Create tournament'}</h1>

    {#if !$flagsLoaded || (editing && stored === undefined)}
      <PageLoading />
    {:else if !$enabled}
      <p class="text-body text-text-muted">Tournaments aren't available yet.</p>
    {:else if !editing && !mayCreate}
      <p class="text-body text-text-muted">Creating tournaments isn't open to everyone yet.</p>
    {:else if editing && !stored}
      <p class="text-body text-text-muted">This tournament isn't there anymore.</p>
    {:else if editing && !stored?.role}
      <p class="text-body text-text-muted">Only the tournament's organizers can edit it.</p>
    {:else}
      {#if editing}
        <p class="text-body text-text-muted">
          {saved ? 'Saved. ' : ''}{statusLine}
          {#if registered && !started}Someone registered, so only the start time and description can change.{/if}
          {#if inPerson && stored}<a href={hrefs.tournamentManage(stored.id)} class="font-semibold text-accent">Open the organizer page</a
            >{/if}
        </p>
      {/if}
      <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div class="flex min-w-0 flex-col gap-4">
          <FormSection n={1} title="Basics">
            <label class="flex flex-col gap-2">
              <span class="text-label font-semibold">Name</span>
              <Input
                value={form.name}
                oninput={(e: Event & { currentTarget: HTMLInputElement }) => set('name', e.currentTarget.value)}
                maxlength={TOURNAMENT_TEXT.nameMax}
                placeholder="e.g. Friday Open"
                disabled={locked}
              />
            </label>
            <div class="flex flex-col gap-2">
              <span id="tc-access" class="text-label font-semibold">Who can join</span>
              <SegmentedControl
                labelledby="tc-access"
                options={seg(ACCESS)}
                value={form.access}
                disabled={locked}
                onchange={(v: CreateForm['access']) => set('access', v)}
              />
              <span class="text-caption text-text-dim">{ACCESS_HELP[form.access]}</span>
            </div>
            <label class="flex flex-col gap-2">
              <span class="text-label font-semibold">Description <span class="font-normal text-text-dim">· optional</span></span>
              <textarea
                value={form.description}
                oninput={(e: Event & { currentTarget: HTMLTextAreaElement }) => set('description', e.currentTarget.value)}
                maxlength={TOURNAMENT_TEXT.descriptionMax}
                rows="3"
                class="resize-y rounded-md border border-line-3 bg-surface-2 px-4 py-3 text-base text-text
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"></textarea>
            </label>
            <OrganizersField tournamentId={params.id} tournamentName={form.name || 'this tournament'} bind:picks={organizers} />
          </FormSection>

          <FormSection n={2} title="Game">
            <OptionCards
              label="Game"
              columns={4}
              options={GAMES}
              value={form.gameId}
              disabled={locked}
              onchange={(v: (typeof GAMES)[number]['value']) => (v === 'x01' || v === 'cricket') && set('gameId', v)}
            />
            {#if form.gameId === 'x01'}
              <div class="grid gap-4 md:grid-cols-2">
                <div class="flex flex-col gap-2">
                  <span id="tc-start-score" class="text-label font-semibold">Start score</span>
                  <SegmentedControl
                    labelledby="tc-start-score"
                    options={seg(START_SCORES)}
                    value={form.startScore}
                    disabled={locked}
                    onchange={(v: CreateForm['startScore']) => set('startScore', v)}
                  />
                </div>
                <div class="flex flex-col gap-2">
                  <span id="tc-checkout" class="text-label font-semibold">Checkout</span>
                  <SegmentedControl
                    labelledby="tc-checkout"
                    options={seg(OUT_MODES)}
                    value={form.outMode}
                    disabled={locked}
                    onchange={(v: CreateForm['outMode']) => set('outMode', v)}
                  />
                </div>
              </div>
            {:else}
              <div class="flex flex-col gap-2">
                <span id="tc-variant" class="text-label font-semibold">Variant</span>
                <SegmentedControl
                  labelledby="tc-variant"
                  options={seg(CRICKET_MODES)}
                  value={form.cricketMode}
                  disabled={locked}
                  onchange={(v: CreateForm['cricketMode']) => set('cricketMode', v)}
                />
              </div>
            {/if}
            <div class="flex flex-col gap-2">
              <span id="tc-first-to" class="text-label font-semibold"
                >Match length <span class="font-normal text-text-dim">· first to … legs</span></span
              >
              <SegmentedControl
                labelledby="tc-first-to"
                options={seg(FIRST_TO)}
                value={form.firstTo}
                disabled={locked}
                onchange={(v: number) => set('firstTo', v)}
              />
              <span class="text-caption text-text-dim">{matchLengthLine(form.firstTo)}</span>
            </div>
            <SwitchRow
              id="tc-longer-final"
              label="Longer final"
              help={form.format === 'round_robin'
                ? LONGER_FINAL_DISABLED
                : 'Play the final (and optionally the semi-finals) over more legs than the other rounds.'}
              checked={form.longerFinal && form.format !== 'round_robin'}
              disabled={locked || form.format === 'round_robin'}
              onchange={(on: boolean) => set('longerFinal', on)}
            />
            {#if form.longerFinal && form.format !== 'round_robin'}
              <div class="flex flex-col gap-2">
                <span id="tc-final" class="text-label font-semibold">Final: first to</span>
                <SegmentedControl
                  labelledby="tc-final"
                  options={seg(finalChoices(form))}
                  value={finalFirstToOf(form)}
                  disabled={locked}
                  onchange={(v: CreateForm['finalFirstTo']) => set('finalFirstTo', v)}
                />
                <label class="flex w-fit items-center gap-2 text-label">
                  <input
                    type="checkbox"
                    checked={form.finalSemis}
                    disabled={locked}
                    onchange={e => set('finalSemis', e.currentTarget.checked)}
                    class="size-4 accent-accent"
                  />
                  Semi-finals too
                </label>
                <span class="text-caption text-text-dim">Only for knockout rounds. Pick a number higher than the normal match length.</span>
              </div>
            {/if}
          </FormSection>

          <FormSection n={3} title="Entry">
            <OptionCards
              label="Entry"
              options={ENTRY}
              value={form.entry}
              disabled={locked}
              onchange={(v: CreateForm['entry']) => set('entry', v)}
            />
            {#if form.entry === 'teams'}
              <div class="grid gap-4 md:grid-cols-2">
                <div class="flex flex-col gap-2">
                  <span id="tc-team-size" class="text-label font-semibold">Players per team</span>
                  <SegmentedControl
                    labelledby="tc-team-size"
                    options={seg(PLAYERS_PER_TEAM)}
                    value={form.playersPerTeam}
                    disabled={locked}
                    onchange={(v: CreateForm['playersPerTeam']) => set('playersPerTeam', v)}
                  />
                </div>
                <div class="flex flex-col gap-2">
                  <span id="tc-team-play" class="text-label font-semibold">Team play</span>
                  <SegmentedControl labelledby="tc-team-play" options={seg(TEAM_PLAY)} value="alternate" disabled={locked} />
                  <span class="text-caption text-text-dim">Players on a team take turns, one visit each, on one shared score.</span>
                  <span class="text-caption text-text-dim">{reasons(TEAM_PLAY)[0]}</span>
                </div>
              </div>
              {#if !inPerson}
                <span class="text-caption text-text-dim"
                  >Captains register their team and pick who plays. Every picked player has to confirm.</span
                >
              {/if}
            {/if}
            {#if inPerson}
              <ParticipantsSection
                bind:draft={participants}
                {perTeam}
                max={maxEntriesOf(form)}
                tournamentId={params.id}
                disabled={started}
                onkeep={(n: number) => set('playersPerTeam', PLAYERS_PER_TEAM.find(c => c.value === n)?.value ?? form.playersPerTeam)}
              />
            {/if}
          </FormSection>

          <AvgLimitSection n={4} {form} {locked} onchange={(v: CreateForm['avgLimit']) => set('avgLimit', v)} />

          <FormSection n={inPerson ? 4 : 5} title="Format">
            <OptionCards
              label="Format"
              options={FORMATS}
              value={form.format}
              disabled={locked}
              onchange={(v: CreateForm['format']) => set('format', v)}
            />
            <div class="grid gap-4 md:grid-cols-2">
              <div class="flex flex-col gap-2" hidden={inPerson}>
                <span id="tc-size" class="text-label font-semibold">{form.entry === 'teams' ? 'Teams' : 'Players'}</span>
                <SegmentedControl
                  labelledby="tc-size"
                  options={seg(sizeChoices(form))}
                  value={toInput(form).maxEntries}
                  disabled={locked}
                  onchange={(v: CreateForm['maxEntries']) => set('maxEntries', v)}
                />
                {#each reasons(sizeChoices(form)) as r (r)}<span class="text-caption text-text-dim">{r}</span>{/each}
              </div>
              <div class="flex flex-col gap-2">
                <span id="tc-seeding" class="text-label font-semibold">Seeding</span>
                <SegmentedControl
                  labelledby="tc-seeding"
                  options={seg(SEEDING)}
                  value={form.seeding}
                  disabled={locked}
                  onchange={(v: CreateForm['seeding']) => set('seeding', v)}
                />
                {#if form.seeding === 'manual'}
                  <span class="text-caption text-text-dim">You can drag players into bracket slots after registration closes.</span>
                {/if}
              </div>
            </div>
            {#if form.format === 'groups_knockout'}
              <div class="grid gap-4 md:grid-cols-2">
                <div class="flex flex-col gap-2">
                  <span id="tc-group-size" class="text-label font-semibold">Group size</span>
                  <SegmentedControl
                    labelledby="tc-group-size"
                    options={seg(GROUP_SIZES)}
                    value={form.groupSize}
                    disabled={locked}
                    onchange={(v: CreateForm['groupSize']) => set('groupSize', v)}
                  />
                </div>
                <div class="flex flex-col gap-2">
                  <span id="tc-through" class="text-label font-semibold">Go through per group</span>
                  <SegmentedControl
                    labelledby="tc-through"
                    options={seg(THROUGH)}
                    value={form.through}
                    disabled={locked}
                    onchange={(v: CreateForm['through']) => set('through', v)}
                  />
                </div>
              </div>
            {/if}
          </FormSection>

          <FormSection n={inPerson ? 5 : 6} title="Schedule & rules">
            {#if inPerson}
              <p class="rounded-md border border-line bg-surface-1 p-3.5 text-label text-text-muted">
                You start it from <b class="text-text">Tournament mode</b> when everyone’s there. Open Tournament mode on every device you want
                to play on (tablets, laptops, phones), all logged in to your account. Each device can pick a match and run it.
              </p>
              <div class="flex flex-col gap-2 md:max-w-[320px]">
                <span class="text-label font-semibold"
                  >Date <span class="font-normal text-text-dim">· optional, for your overview</span></span
                >
                <DatePicker
                  label="Date"
                  value={form.plannedFor.slice(0, 10)}
                  onchange={(v: string) => set('plannedFor', v ? `${v}T00:00` : '')}
                />
              </div>
              <InPersonBoards value={form.boardIds} onchange={(ids: string[] | null) => set('boardIds', ids)} />
            {:else}
              <div class="flex flex-col gap-2">
                <span id="tc-start" class="text-label font-semibold">When does it start?</span>
                <SegmentedControl
                  labelledby="tc-start"
                  options={[
                    { value: 'fixed', label: 'Fixed start time' },
                    {
                      value: 'organizer',
                      label: 'Organizers start it',
                      disabled: form.access === 'public',
                      title: form.access === 'public' ? ORGANIZER_START_DISABLED : undefined,
                    },
                  ]}
                  value={startMode}
                  onchange={(v: CreateForm['startMode']) => set('startMode', v)}
                />
                {#if form.access === 'public'}<span class="text-caption text-text-dim">{ORGANIZER_START_DISABLED}</span>{/if}
              </div>
              {#if startMode === 'fixed'}
                <div class="grid gap-4 md:grid-cols-2">
                  <div class="flex flex-col gap-2 md:col-span-2 md:max-w-[420px]">
                    <span class="text-label font-semibold">Starts</span>
                    <DateTimeField label="Start" value={form.startsAt} onchange={(v: string) => set('startsAt', v)} />
                  </div>
                  <div class="flex flex-col gap-2">
                    <span class="text-label font-semibold">Registration closes</span>
                    <Select
                      label="Registration closes"
                      options={REGISTRATION_CLOSES.map(c => ({ value: String(c.value), label: c.label }))}
                      value={String(form.registrationCloses)}
                      onchange={(v: string) =>
                        set('registrationCloses', REGISTRATION_CLOSES.find(c => String(c.value) === v)?.value ?? form.registrationCloses)}
                    />
                  </div>
                  <div class="flex flex-col gap-2">
                    <span class="text-label font-semibold">Check-in</span>
                    <Select
                      label="Check-in"
                      options={checkInChoices(form)
                        .filter(c => !c.disabled)
                        .map(c => ({ value: String(c.value), label: c.label }))}
                      value={String(checkInBeforeOf(form))}
                      onchange={(v: string) => set('checkInBefore', CHECK_IN_BEFORE.find(c => String(c.value) === v)?.value ?? null)}
                    />
                    {#each reasons(checkInChoices(form)) as r (r)}<span class="text-caption text-text-dim">{r}</span>{/each}
                  </div>
                </div>
              {:else}
                <p class="rounded-md border border-line bg-surface-1 p-3.5 text-label text-text-muted">
                  No set time. Registration stays open until you press <b class="text-text">Start tournament</b> on the tournament page. Players
                  get a notification and have a few minutes to check in; anyone who doesn’t is removed and the bracket is drawn from who’s there.
                </p>
                <div class="grid gap-4 md:grid-cols-2">
                  <div class="flex flex-col gap-2">
                    <span class="text-label font-semibold"
                      >Planned for <span class="font-normal text-text-dim">· optional, shown as a hint</span></span
                    >
                    <DateTimeField label="Planned" value={form.plannedFor} onchange={(v: string) => set('plannedFor', v)} />
                  </div>
                  <div class="flex flex-col gap-2">
                    <span id="tc-check-in-after" class="text-label font-semibold">Check-in after start</span>
                    <SegmentedControl
                      labelledby="tc-check-in-after"
                      options={seg(CHECK_IN_AFTER)}
                      value={form.checkInAfter}
                      onchange={(v: CreateForm['checkInAfter']) => set('checkInAfter', v)}
                    />
                  </div>
                </div>
              {/if}
              <SwitchRow
                id="tc-manual"
                label="Allow manual scoring"
                help="Players without a paired board can type their scores."
                checked={form.manualScoring}
                disabled={locked}
                onchange={(on: boolean) => set('manualScoring', on)}
              />
              <SwitchRow
                id="tc-no-show"
                label="No-show forfeit"
                help="A player or team that hasn’t joined their match after the wait time loses it."
                checked={form.noShow}
                disabled={locked}
                onchange={(on: boolean) => set('noShow', on)}
              />
              {#if form.noShow}
                <div class="flex flex-col gap-2 md:max-w-[360px]">
                  <span id="tc-wait" class="text-label font-semibold">Wait time</span>
                  <SegmentedControl
                    labelledby="tc-wait"
                    options={seg(NO_SHOW_WAIT)}
                    value={form.noShowMinutes}
                    disabled={locked}
                    onchange={(v: CreateForm['noShowMinutes']) => set('noShowMinutes', v)}
                  />
                </div>
              {/if}
            {/if}
          </FormSection>
        </div>

        <CreatePreview
          {preview}
          {owner}
          {problems}
          {errors}
          {primary}
          secondary={!draft ? null : editing ? 'Save draft' : 'Save as draft'}
          footnote={editing ? null : preview.footnote}
          {busy}
          onsave={save}
        />
      </div>
    {/if}
  </main>
</Layout>
