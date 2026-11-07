<script lang="ts">
  // "What the coach detects" (Coach-Mistakes): every check this version runs, from lib/coach/checks.ts.
  import Layout from '$lib/components/Layout.svelte'
  import { flag, flagsLoaded } from '$lib/flags'
  import { CHECK_GROUPS, GRADE_LEGEND, SOURCES, type CheckSource } from '$lib/coach/checks'
  import GradePill from '$lib/components/coach/GradePill.svelte'
  import { TONE_TEXT, type PillTone } from '$lib/coach/tone'

  const enabled = flag('coach.enabled')
  const sources: CheckSource[] = ['scores', 'model']
  const total = CHECK_GROUPS.reduce((n, g) => n + g.checks.length, 0)
  const SOURCE_TONE: Record<CheckSource, PillTone> = { scores: 'plain', model: 'info' }
  const COLUMNS = 'lg:grid-cols-[200px_96px_90px_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1fr)]'
</script>

{#snippet source(s: CheckSource)}
  <span title={SOURCES[s].text} class="inline-flex items-center gap-1.5 text-[12.5px] whitespace-nowrap {TONE_TEXT[SOURCE_TONE[s]]}">
    <span class="size-[7px] rounded-full bg-current"></span>{SOURCES[s].label}
  </span>
{/snippet}

<Layout title="Coach">
  <main class="flex min-h-0 flex-grow flex-col gap-6 overflow-y-auto px-4 py-4 md:px-8 md:py-10 xl:px-11">
    <header class="flex flex-col gap-2">
      <a href="#/coach" class="text-[12px] font-semibold label-caps no-underline">Coach · Review</a>
      <h1 class="m-0 font-display text-[34px] font-bold uppercase leading-none md:text-[48px]">What the coach can detect</h1>
      <p class="m-0 max-w-[900px] text-[15px] leading-normal text-text-muted md:text-[16px]">
        {total} checks run on every X01 leg with double out. Visit checks put a label and a note on the visit; leg patterns go into the coach's
        take. Each dart is judged on the score left before it, not on the score the visit started on, so one visit can run from scoring into a
        setup, or from a setup into a finish: it carries a tag for each phase it went through, Scoring, Setup, Doubling, never more than two.
        Scoring compares with your own average, so a 45 means more at 40 average than at 90.
      </p>
    </header>

    {#if !$enabled}
      <!-- Until the flags load, nothing: the checks are on the page already, not fetched -->
      {#if $flagsLoaded}<p class="m-0 text-[15px] text-text-muted">The coach isn't available yet.</p>{/if}
    {:else}
      <div class="flex flex-wrap items-start gap-7">
        <div class="flex min-w-0 max-w-full flex-col gap-2">
          <span id="checks-grades" class="text-[12px] font-semibold label-caps text-text-dim">Labels on a visit</span>
          <div class="max-w-full overflow-x-auto">
            <table aria-labelledby="checks-grades" class="border-collapse text-[13px] tabular-nums">
              <thead>
                <tr class="text-left text-[11px] uppercase tracking-[0.08em] text-text-dim">
                  <th scope="col" class="py-1 pr-3 font-semibold">Grade</th>
                  <th scope="col" class="py-1 pr-3 font-semibold">Means</th>
                  <th scope="col" class="py-1 pr-3 font-semibold">Setup, doubling</th>
                  <th scope="col" class="py-1 font-semibold">Scoring</th>
                </tr>
              </thead>
              <tbody>
                {#each GRADE_LEGEND as l (l.label)}
                  <tr class="border-t border-surface-paused">
                    <th scope="row" class="py-1.5 pr-3 text-left font-normal"><GradePill grade={l.label} /></th>
                    <td class="py-1.5 pr-3 text-text-muted">{l.text}</td>
                    <td class="py-1.5 pr-3 whitespace-nowrap text-ink-2">{l.finish ?? 'fewest darts'}</td>
                    <td class="py-1.5 whitespace-nowrap text-ink-2">{l.scoring === null ? 'fewest darts' : `${l.scoring} vs average`}</td>
                  </tr>
                {/each}
                <tr class="border-t border-surface-paused">
                  <th scope="row" class="py-1.5 pr-3 text-left font-normal"><GradePill grade="tip" /></th>
                  <td colspan="3" class="py-1.5 text-text-muted">worth knowing, not graded</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <span class="text-[12px] font-semibold label-caps text-text-dim">Source</span>
          <div class="flex flex-wrap gap-[18px]">
            {#each sources as s (s)}
              <span class="flex flex-col gap-0.5">
                {@render source(s)}
                <span class="max-w-[230px] text-[12.5px] text-text-dim">{SOURCES[s].text}</span>
              </span>
            {/each}
          </div>
        </div>
      </div>

      {#each CHECK_GROUPS as g (g.title)}
        <!-- shrink-0: overflow-hidden lets a flex child shrink below its content, which clipped the rows to the main's height -->
        <section aria-labelledby="checks-{g.title}" class="card shrink-0 overflow-hidden">
          <div class="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 px-[18px] pt-[18px] pb-3">
            <h2 id="checks-{g.title}" class="m-0 font-display text-[28px] font-bold uppercase tracking-[0.02em]">{g.title}</h2>
            <span class="text-[14px] text-text-muted">{g.scope}</span>
            <span class="ml-auto text-[13px] text-text-dim">{g.checks.length} {g.checks.length === 1 ? 'check' : 'checks'}</span>
          </div>
          <div
            aria-hidden="true"
            class="hidden gap-[18px] border-t border-line px-[18px] py-2.5 text-[12px] font-semibold label-caps text-text-dim lg:grid {COLUMNS}"
          >
            <span>Check</span><span>Label</span><span>Source</span><span>Detected when</span><span>Example</span><span>Coach says</span>
          </div>
          {#each g.checks as c (c.name)}
            <div class="flex flex-col gap-2 border-t border-surface-paused px-[18px] py-3.5 lg:grid lg:items-start lg:gap-[18px] {COLUMNS}">
              <h3 class="m-0 text-[15.5px] font-semibold leading-[1.35]">{c.name}</h3>
              <span class="flex flex-wrap gap-1"
                >{#each c.labels as l (l)}<GradePill grade={l} />{/each}</span
              >
              <span class="lg:pt-[3px]">{@render source(c.source)}</span>
              <p class="m-0 text-[14px] leading-normal text-ink-2">
                <span class="label-caps text-[11px] text-text-dim lg:hidden">Detected when · </span>{c.when}
              </p>
              <code
                class="self-start rounded-[8px] border border-surface-paused bg-bg px-[9px] py-1.5 font-mono text-[12.5px] leading-[1.55] text-text"
                >{c.example}</code
              >
              <p class="m-0 text-[13.5px] leading-normal text-text-muted">
                <span class="label-caps text-[11px] text-text-dim lg:hidden">Coach says · </span>{c.says}
              </p>
            </div>
          {/each}
        </section>
      {/each}
    {/if}
  </main>
</Layout>
