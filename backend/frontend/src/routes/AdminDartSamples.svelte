<!-- Admin Dart samples page (`#/admin/dart-samples`): training data for the dart detection model.
     Totals, the download of what is new since the last one, and the latest samples with each
     camera's still and where Autodarts and the game put the dart. -->
<script lang="ts">
  import { push } from 'svelte-spa-router'
  import { Download, RefreshCw } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageMain from '$lib/components/PageMain.svelte'
  import PageTitle from '$lib/components/PageTitle.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Chip } from '$lib/components/ui/chip/index.js'
  import { currentUser } from '$lib/auth'
  import { dartSamplesTrail } from '$lib/admin/breadcrumbs'
  import { formatBytes } from '$lib/admin/system'
  import {
    LABELS,
    exportUrl,
    labelText,
    lastDownloaded,
    loadSamples,
    markerAt,
    rememberDownloaded,
    stillUrl,
    type AdminDartSamples,
    type DartSample,
    type DartSampleLabel,
  } from '$lib/admin/dartSamples'

  // Not an admin: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

  const CAMS = [0, 1, 2]

  let data = $state<AdminDartSamples | null>(null)
  let samples = $state<DartSample[]>([])
  let label = $state<DartSampleLabel | null>(null)
  let downloadLabel = $state<DartSampleLabel | null>(null)
  let open = $state<string | null>(null)
  let loadError = $state('')
  let more = $state(false)
  let downloadedUpTo = $state(lastDownloaded())

  async function refresh(filter = label): Promise<void> {
    const d = await loadSamples({ label: filter })
    if (!d) {
      loadError = "Couldn't load the samples."
      return
    }
    loadError = ''
    data = d
    samples = d.samples
    more = d.samples.length > 0
  }

  async function loadMore(): Promise<void> {
    const d = await loadSamples({ label, before: samples.at(-1)?.id })
    if (!d) return
    samples = [...samples, ...d.samples]
    more = d.samples.length > 0
  }

  // A new filter starts the list over
  $effect(() => {
    const filter = label
    open = null
    void refresh(filter)
  })

  function downloaded(upTo: string): void {
    rememberDownloaded(upTo)
    downloadedUpTo = upTo
  }

  const total = $derived(
    data ? data.totals.byLabel.autodarts + data.totals.byLabel.corrected_spot + data.totals.byLabel.corrected_segment : 0,
  )
  // Nothing new since the last download (or a cursor from a database that was reset)
  const upToDate = $derived(
    data?.settledNewestId !== null && downloadedUpTo !== null && BigInt(downloadedUpTo) >= BigInt(data?.settledNewestId ?? 0),
  )
</script>

{#snippet row(name: string, value: string)}
  <div class="flex flex-col gap-[2px] sm:flex-row sm:items-baseline sm:gap-4 py-2 border-b border-line last:border-b-0">
    <dt class="sm:w-[190px] shrink-0 text-[13px] text-text-muted">{name}</dt>
    <dd class="m-0 min-w-0 break-words text-[14px] text-text">{value}</dd>
  </div>
{/snippet}

{#snippet still(s: DartSample, phase: 'before' | 'after', cam: number)}
  <figure class="m-0 relative aspect-square overflow-hidden rounded-[8px] bg-bg border border-line">
    <img src={stillUrl(s.id, phase, cam)} alt="Camera {cam + 1}, {phase} the dart" loading="lazy" class="block size-full object-cover" />
    {#if phase === 'after'}
      {#if s.autodarts.coords}
        {@const m = markerAt(s.autodarts.coords)}
        <span
          title="Autodarts: {s.autodarts.segment}"
          class="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-live"
          style:left="{m.left}%"
          style:top="{m.top}%"
        ></span>
      {/if}
      {#if s.final?.corrected && s.final.coords}
        {@const m = markerAt(s.final.coords)}
        <span
          title="Corrected: {s.final.segment}"
          class="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-grade-good"
          style:left="{m.left}%"
          style:top="{m.top}%"
        ></span>
      {/if}
    {/if}
    <figcaption class="absolute left-1 top-1 px-1 rounded bg-black/60 text-[11px] text-white">Cam {cam + 1}</figcaption>
  </figure>
{/snippet}

<Layout title="Dart samples">
  {#if $currentUser?.isAdmin}
    <PageMain>
      <header class="flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          as="div"
          trail={dartSamplesTrail()}
          title="Dart samples"
          sub="Camera darts kept as training data for the dart detection model"
        />
        <Button variant="outline" size="md" aria-label="Refresh" class="w-11 px-0" onclick={() => void refresh()}>
          <RefreshCw size={16} />
        </Button>
      </header>

      {#if loadError}<ErrorText>{loadError}</ErrorText>{/if}

      {#if data}
        {@const t = data.totals}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 items-start">
          <section class="card p-4 md:p-5 flex flex-col gap-2" aria-labelledby="ds-totals">
            <h2 id="ds-totals" class="m-0 text-[17px] font-semibold">Totals</h2>
            <dl class="m-0 flex flex-col">
              {@render row('Samples', String(total))}
              {#each LABELS as l (l.value)}{@render row(l.text, String(t.byLabel[l.value]))}{/each}
              {@render row('Boards', `${t.boards} with samples · ${t.sharingBoards} sharing`)}
              {@render row(
                'Storage',
                t.maxBytes > 0 ? `${formatBytes(t.bytes)} of ${formatBytes(t.maxBytes)}` : `${formatBytes(t.bytes)} · collection off`,
              )}
              {@render row('Newest', t.newest ? new Date(t.newest).toLocaleString() : '–')}
            </dl>
          </section>

          <section class="card p-4 md:p-5 flex flex-col gap-3" aria-labelledby="ds-download">
            <h2 id="ds-download" class="m-0 text-[17px] font-semibold">Download</h2>
            <p class="m-0 text-[13.5px] leading-[1.45] text-text-muted">
              A tar of each sample's six stills (<code>&lt;id&gt;/after-0.jpg</code>, …) and <code>labels.jsonl</code>. A sample is included
              once it's an hour old, when its visit can no longer be corrected.
            </p>
            <div class="flex flex-wrap gap-2">
              <Chip selected={downloadLabel === null} onclick={() => (downloadLabel = null)}>All</Chip>
              {#each LABELS as l (l.value)}
                <Chip selected={downloadLabel === l.value} onclick={() => (downloadLabel = l.value)}>{l.text}</Chip>
              {/each}
            </div>
            {#if data.settledNewestId}
              {@const upTo = data.settledNewestId}
              <div class="flex flex-wrap items-center gap-2">
                <Button
                  variant="accent"
                  size="md"
                  class="font-semibold"
                  href={exportUrl(upTo, downloadedUpTo, downloadLabel)}
                  download
                  disabled={upToDate}
                  onclick={() => downloaded(upTo)}
                >
                  <Download size={16} />{downloadedUpTo ? 'Download new samples' : 'Download all samples'}
                </Button>
                {#if downloadedUpTo}
                  <Button variant="outline" size="md" href={exportUrl(upTo, null, downloadLabel)} download onclick={() => downloaded(upTo)}>
                    Download all again
                  </Button>
                {/if}
              </div>
              <p class="m-0 text-[13px] text-text-muted">
                {upToDate
                  ? `Nothing new since your last download (up to #${downloadedUpTo}).`
                  : downloadedUpTo
                    ? `Samples #${downloadedUpTo} to #${upTo}, after your last download.`
                    : `Samples up to #${upTo}.`}
              </p>
            {:else}
              <p class="m-0 text-[14px]">No sample is an hour old yet.</p>
            {/if}
          </section>
        </div>

        <section class="flex flex-col gap-3" aria-labelledby="ds-latest">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 id="ds-latest" class="m-0 text-[17px] font-semibold">Latest samples</h2>
            <div class="flex flex-wrap gap-2">
              <Chip selected={label === null} onclick={() => (label = null)}>All</Chip>
              {#each LABELS as l (l.value)}
                <Chip selected={label === l.value} onclick={() => (label = l.value)}>{l.text}</Chip>
              {/each}
            </div>
          </div>
          <p class="m-0 text-[13px] text-text-muted">
            <span class="inline-block size-2.5 rounded-full bg-live align-middle"></span> where Autodarts put the dart ·
            <span class="inline-block size-3 rounded-full border-2 border-grade-good align-middle"></span> where a player moved it
          </p>

          {#if samples.length === 0}
            <p class="m-0 text-[14px] text-text-muted">No samples{label ? ` with this label` : ''} yet.</p>
          {/if}
          {#each samples as s (s.id)}
            <article class="card p-3 md:p-4 flex flex-col gap-3">
              <button
                type="button"
                class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-left bg-transparent border-0 p-0 cursor-pointer font-[inherit] text-text"
                aria-expanded={open === s.id}
                onclick={() => (open = open === s.id ? null : s.id)}
              >
                <span class="font-mono text-[13px] text-text-muted">#{s.id}</span>
                <span class="text-[15px] font-semibold">
                  {s.autodarts.segment}{#if s.final && s.final.segment !== s.autodarts.segment}
                    → {s.final.segment}{/if}
                </span>
                <span class="text-[13px] text-text-muted">{labelText(s.label)}{s.final ? '' : ' · not in a finished visit'}</span>
                <span class="text-[13px] text-text-muted">{new Date(s.capturedAt).toLocaleString()} · BM {s.bmVersion ?? '?'}</span>
              </button>
              <div class="grid grid-cols-3 gap-2">
                {#each CAMS as cam (cam)}{@render still(s, 'after', cam)}{/each}
              </div>
              {#if open === s.id}
                <p class="m-0 text-[13px] text-text-muted">Before the dart</p>
                <div class="grid grid-cols-3 gap-2">
                  {#each CAMS as cam (cam)}{@render still(s, 'before', cam)}{/each}
                </div>
              {/if}
            </article>
          {/each}
          {#if more}
            <Button variant="outline" size="md" class="self-center" onclick={() => void loadMore()}>Load more</Button>
          {/if}
        </section>
      {/if}
    </PageMain>
  {/if}
</Layout>
