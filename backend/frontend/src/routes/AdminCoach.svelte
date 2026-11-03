<!-- Admin Coach sandbox (`#/admin/coach`): a score, an optional opponent and up to three darts on
     the board, reviewed live as the coach reviews a leg. No API calls: the coach runs here. -->
<script lang="ts">
  import { push } from 'svelte-spa-router'
  import { Eraser, Undo2 } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageMain from '$lib/components/PageMain.svelte'
  import PageTitle from '$lib/components/PageTitle.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import BoardCard from '$lib/components/coach/BoardCard.svelte'
  import GradePill from '$lib/components/coach/GradePill.svelte'
  import GroupingPill from '$lib/components/coach/GroupingPill.svelte'
  import DartTile from '$lib/components/coach/DartTile.svelte'
  import VisitDetail from '$lib/components/coach/VisitDetail.svelte'
  import VisitNumbers from '$lib/components/coach/VisitNumbers.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { currentUser } from '$lib/auth'
  import { coachTrail } from '$lib/admin/breadcrumbs'
  import { visitTiles } from '$lib/coach/dart'
  import { dartAt, dartFromLabel } from '$lib/coach/sandbox'
  import { coachOpenVisit } from '$shared/coach/openVisit'
  import { explainedNote } from '$shared/coach/grade'
  import type { CoachDart } from '$shared/coach/walk'
  import type { CoachNote } from '$shared/coach'
  import { averageForLevel } from '$shared/botLevels'
  import { coachLevel } from '$shared/coach/model'
  import { coachModel } from '$lib/coach/model.svelte'

  // Not an admin: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

  let startText = $state('57')
  let opponentText = $state('')
  let averageText = $state('60')
  let typed = $state('')
  let typedError = $state('')
  let darts = $state<CoachDart[]>([])

  /** How many of the best aims to show for the next dart */
  const TOP = 5
  const whole = (s: string, lo: number, hi: number): number | null => {
    const n = Number(s.trim())
    return s.trim() !== '' && Number.isInteger(n) && n >= lo && n <= hi ? n : null
  }
  const start = $derived(whole(startText, 2, 501))
  const opponent = $derived(opponentText.trim() === '' ? null : whole(opponentText, 2, 501))
  const average = $derived(whole(averageText, 1, 180))
  const inputError = $derived(
    start === null
      ? 'The score left is a whole number from 2 to 501.'
      : opponentText.trim() !== '' && opponent === null
        ? "The opponent's score is a whole number from 2 to 501, or empty."
        : average === null
          ? 'Your average is a whole number from 1 to 180.'
          : '',
  )
  // The model of the level one above the average, as the coach picks it; fetched per level
  const level = $derived(coachLevel(average))
  const levelAverage = $derived(averageForLevel(level))
  const loaded = coachModel(() => level)
  const model = $derived(loaded.model)
  const result = $derived(
    start !== null && average !== null && !inputError && model?.level === level
      ? coachOpenVisit({ start, opponent, average }, darts, model, TOP)
      : null,
  )
  const visit = $derived(result?.visit ?? null)
  const note = $derived(visit ? explainedNote(visit.notes) : null)
  const accepting = $derived(result !== null && !result.done)

  function add(d: CoachDart): void {
    if (accepting) darts = [...darts, d]
  }
  const place = (p: { x: number; y: number }) => add(dartAt(p))
  function addTyped(e: SubmitEvent): void {
    e.preventDefault()
    const d = dartFromLabel(typed)
    if (!d) {
      typedError = 'Type a dart like S20, T19, D16, Bull, 25 or Miss.'
      return
    }
    typedError = ''
    typed = ''
    add(d)
  }

  const pct = (p: number) => `${(p * 100).toFixed(1)}%`
  /** "S17 instead: S20 leaves 37, with no one-dart finish. Costs 12.3% · book: T17 D3" */
  const noteLine = (n: CoachNote) =>
    `${n.better} instead${n.reason ? `: ${n.reason}` : ''}. Costs ${pct(n.cost)} of the checkout chance${n.book ? ` · book: ${n.book.join(' ')}` : ''}.`
</script>

<Layout title="Coach sandbox">
  {#if $currentUser?.isAdmin}
    <PageMain>
      <PageTitle trail={coachTrail()} title="Coach sandbox" sub="Throw a made-up visit and see what the coach says about it" />

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 items-start">
        <section class="card p-4 md:p-5 flex flex-col gap-4" aria-labelledby="sandbox-visit">
          <h2 id="sandbox-visit" class="m-0 text-[17px] font-semibold">The visit</h2>
          <div class="grid grid-cols-3 gap-3">
            <div class="flex flex-col gap-2">
              <label for="sandbox-start" class="field-label">Score left</label>
              <Input id="sandbox-start" inputmode="numeric" bind:value={startText} oninput={() => (darts = [])} />
            </div>
            <div class="flex flex-col gap-2">
              <label for="sandbox-opponent" class="field-label">Opponent left</label>
              <Input id="sandbox-opponent" inputmode="numeric" placeholder="Solo" bind:value={opponentText} />
            </div>
            <div class="flex flex-col gap-2">
              <label for="sandbox-average" class="field-label">Your average</label>
              <Input id="sandbox-average" inputmode="numeric" bind:value={averageText} />
            </div>
          </div>
          {#if average !== null}
            <p class="m-0 text-[13px] text-text-muted">Coaching level: {level} (≈ {levelAverage} average)</p>
          {/if}
          {#if inputError}<ErrorText>{inputError}</ErrorText>{/if}
          {#if loaded.failed}<ErrorText>Level {level}'s model couldn't load. Reload to try again.</ErrorText>{/if}

          <BoardCard darts={visit?.darts ?? []} {note} onpoint={accepting ? place : undefined} />

          <form class="flex gap-2" onsubmit={addTyped}>
            <Input aria-label="Type a dart" placeholder="S20, T19, D16, Bull, 25, Miss" bind:value={typed} disabled={!accepting} />
            <Button type="submit" variant="outline" size="md" disabled={!accepting}>Add</Button>
            <Button
              variant="outline"
              size="md"
              aria-label="Undo the last dart"
              class="w-11 px-0"
              disabled={darts.length === 0}
              onclick={() => (darts = darts.slice(0, -1))}><Undo2 size={16} /></Button
            >
            <Button
              variant="outline"
              size="md"
              aria-label="Clear the darts"
              class="w-11 px-0"
              disabled={darts.length === 0}
              onclick={() => (darts = [])}><Eraser size={16} /></Button
            >
          </form>
          {#if typedError}<ErrorText>{typedError}</ErrorText>{/if}
          <p class="m-0 text-[13px] text-text-muted">
            {#if !result}Fix the inputs to throw.
            {:else if result.done}{visit?.bust ? 'Bust' : visit?.then === 0 ? 'Checked out' : 'Three darts thrown'}: undo or clear to throw
              again.
            {:else}Click the board or type a dart: dart {darts.length + 1} of 3, {result.left} left.{/if}
          </p>
        </section>

        <section class="card p-4 md:p-5 flex flex-col gap-4" aria-labelledby="sandbox-coach">
          <div class="flex items-baseline justify-between gap-3">
            <h2 id="sandbox-coach" class="m-0 text-[17px] font-semibold">The coach</h2>
            {#if visit}
              <span class="inline-flex flex-wrap items-center gap-2 text-[13px] text-text-muted capitalize"
                >{visit.tag}<GradePill grade={visit.grade} /><GroupingPill grouping={visit.grouping} /></span
              >
            {/if}
          </div>

          {#if visit}
            <p class="m-0 text-[14px] {visit.tip ? 'text-ice' : ''}">{visit.text}</p>
            <ul class="m-0 p-0 list-none flex flex-col gap-2.5">
              {#each visitTiles(visit) as tile, i (i)}
                {@const n = visit.notes.find(x => x.dart === i)}
                <li class="flex items-start gap-3">
                  <DartTile {tile} />
                  <span class="text-[13.5px] leading-[1.45] pt-1 {n?.tip ? 'text-ice' : ''}">
                    {#if n}<b>{n.tip ? 'Tip:' : 'Note:'}</b> {noteLine(n)}{:else}<span class="text-text-muted">Fine.</span>{/if}
                  </span>
                </li>
              {/each}
            </ul>
            <VisitDetail {visit} />
            <div class="flex flex-col gap-2">
              <h3 class="m-0 text-[15px] font-semibold">Dart classes</h3>
              <p class="m-0 text-[12px] text-text-muted">
                Millimetres: Dist from the target's point, Edge from the nearest point of its bed (0 in it). Out is away from the bull, CW
                is clockwise, both from the point. Leave is planned → actual. Δ is the change in checkout chance (points, against a
                {levelAverage}-average player from there), Close the credit for a near miss; the visit's grade adds them up.
              </p>
              <VisitNumbers {visit} />
            </div>
          {:else}
            <p class="m-0 text-[14px] text-text-muted">Throw a dart to see the coach's review.</p>
          {/if}

          {#if result && !result.done}
            <div class="flex flex-col gap-2">
              <h3 class="m-0 text-[15px] font-semibold">Next dart: best aims (chance to check out this visit or next)</h3>
              {#if result.next.length}
                <ol class="m-0 p-0 list-none flex flex-col">
                  {#each result.next as a (a.aim.label)}
                    <li class="flex justify-between py-1.5 border-b border-line last:border-b-0 text-[14px]">
                      <span class="font-display font-bold text-[18px]">{a.aim.label}</span>
                      <span class="text-text-muted tabular-nums">{pct(a.chance)}</span>
                    </li>
                  {/each}
                </ol>
              {:else}
                <p class="m-0 text-[14px] text-text-muted">No aim reaches a checkout from {result.left}.</p>
              {/if}
            </div>
          {/if}
        </section>
      </div>
    </PageMain>
  {/if}
</Layout>
