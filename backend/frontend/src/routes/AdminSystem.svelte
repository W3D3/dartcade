<!-- Admin System page (`#/admin/system`): build, runtime, database, live counts and config of this server,
     refreshed every 10 s while visible, with a Copy debug info button for bug reports. -->
<script lang="ts">
  import { createCopy } from '$lib/clipboard.svelte'
  import { onDestroy, onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { Copy, RefreshCw } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageMain from '$lib/components/PageMain.svelte'
  import PageTitle from '$lib/components/PageTitle.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { currentUser } from '$lib/auth'
  import { SPA_BUILD, commitUrl, isStale, serverVersion, shortCommit } from '$lib/version'
  import { systemTrail } from '$lib/admin/breadcrumbs'
  import { buildLabel, debugMarkdown, formatBytes, formatDuration, loadSystem, type AdminSystem } from '$lib/admin/system'

  // Not an admin: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

  let system = $state<AdminSystem | null>(null)
  let loadError = $state('')
  const clip = createCopy(0)

  async function refresh(): Promise<void> {
    const s = await loadSystem()
    if (!s) {
      loadError = "Couldn't load the system details."
      return
    }
    system = s
    loadError = ''
    // The stale-tab notice (UpdateNotice) reads this too
    serverVersion.set({ version: s.build.version, commit: s.build.commit, buildTime: s.build.buildTime })
  }

  const REFRESH_MS = 10_000
  let timer: ReturnType<typeof setInterval> | undefined
  function schedule(): void {
    clearInterval(timer)
    timer = document.hidden ? undefined : setInterval(() => void refresh(), REFRESH_MS)
  }
  function onVisibility(): void {
    if (!document.hidden) void refresh()
    schedule()
  }
  onMount(() => {
    void refresh()
    schedule()
    document.addEventListener('visibilitychange', onVisibility)
  })
  onDestroy(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  })

  async function copyDebugInfo(): Promise<void> {
    if (!system) return
    await clip.copy(debugMarkdown(system, { userAgent: navigator.userAgent, spa: SPA_BUILD }))
  }

  const stale = $derived(isStale(SPA_BUILD, $serverVersion))
</script>

{#snippet row(label: string, value: string)}
  <div class="flex flex-col gap-[2px] sm:flex-row sm:items-baseline sm:gap-4 py-2 border-b border-line last:border-b-0">
    <dt class="sm:w-[190px] shrink-0 text-[13px] text-text-muted">{label}</dt>
    <dd class="m-0 min-w-0 break-words text-[14px] text-text">{value}</dd>
  </div>
{/snippet}

<Layout title="System">
  {#if $currentUser?.isAdmin}
    <PageMain>
      <header class="flex flex-wrap items-end justify-between gap-3">
        <PageTitle as="div" trail={systemTrail()} title="System" sub="What this server runs, and what it's doing right now" />
        <div class="flex items-center gap-2">
          <Button variant="outline" size="md" aria-label="Refresh" class="w-11 px-0" onclick={() => void refresh()}>
            <RefreshCw size={16} />
          </Button>
          <Button variant="outline" size="md" class="font-semibold" disabled={!system} onclick={() => void copyDebugInfo()}>
            <Copy size={16} />{clip.state === 'copied'
              ? 'Copied'
              : clip.state === 'failed'
                ? 'Copy failed — select the text below'
                : 'Copy debug info'}
          </Button>
        </div>
      </header>

      {#if loadError}<ErrorText>{loadError}</ErrorText>{/if}
      {#if clip.state === 'failed' && system}
        <pre
          class="m-0 max-h-60 overflow-auto p-3 rounded-[9px] bg-bg border border-line-chip font-mono text-[11px] whitespace-pre-wrap break-all">{debugMarkdown(
            system,
            { userAgent: navigator.userAgent, spa: SPA_BUILD },
          )}</pre>
      {/if}

      {#if system}
        {@const { build, runtime, database, live, config } = system}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 items-start">
          <section class="card p-4 md:p-5 flex flex-col gap-2" aria-labelledby="sys-build">
            <h2 id="sys-build" class="m-0 text-[17px] font-semibold">Build</h2>
            <dl class="m-0 flex flex-col">
              {@render row('Version', build.version)}
              <div class="flex flex-col gap-[2px] sm:flex-row sm:items-baseline sm:gap-4 py-2 border-b border-line">
                <dt class="sm:w-[190px] shrink-0 text-[13px] text-text-muted">Commit</dt>
                <dd class="m-0 text-[14px] font-mono">
                  {#if build.commit}
                    <a href={commitUrl(build.commit)} target="_blank" rel="noopener noreferrer">{shortCommit(build.commit)}</a>
                  {:else}–{/if}
                </dd>
              </div>
              {@render row('Built', build.buildTime ? new Date(build.buildTime).toLocaleString() : '–')}
              {#if build.preview}
                <div class="flex flex-col gap-[2px] sm:flex-row sm:items-baseline sm:gap-4 py-2 border-b border-line">
                  <dt class="sm:w-[190px] shrink-0 text-[13px] text-text-muted">Preview</dt>
                  <dd class="m-0 text-[14px]">
                    <a href={build.preview.url} target="_blank" rel="noopener noreferrer">PR #{build.preview.pr}</a>
                  </dd>
                </div>
              {/if}
              {@render row('This tab', buildLabel(SPA_BUILD) + (stale ? ' (outdated: reload)' : ''))}
            </dl>
          </section>

          <section class="card p-4 md:p-5 flex flex-col gap-2" aria-labelledby="sys-live">
            <h2 id="sys-live" class="m-0 text-[17px] font-semibold">Live</h2>
            <dl class="m-0 flex flex-col">
              {@render row('Browsers connected', String(live.browsers))}
              {@render row('Bridges connected', String(live.bridges))}
              {@render row('Boards online', String(live.boardsOnline))}
              {@render row('Running games', String(live.runningGames))}
              {@render row('Open lobbies', String(live.openLobbies))}
            </dl>
          </section>

          <section class="card p-4 md:p-5 flex flex-col gap-2" aria-labelledby="sys-runtime">
            <h2 id="sys-runtime" class="m-0 text-[17px] font-semibold">Runtime</h2>
            <dl class="m-0 flex flex-col">
              {@render row('Node', `${runtime.node} (${runtime.platform}/${runtime.arch})`)}
              {@render row('Host', runtime.hostname)}
              {@render row('Timezone', runtime.timezone)}
              {@render row('NODE_ENV', runtime.nodeEnv ?? '–')}
              {@render row('Up for', `${formatDuration(runtime.uptimeSeconds)} (since ${new Date(runtime.startedAt).toLocaleString()})`)}
              {@render row('Memory (RSS)', formatBytes(runtime.memory.rss))}
              {@render row('Heap', `${formatBytes(runtime.memory.heapUsed)} of ${formatBytes(runtime.memory.heapTotal)}`)}
              {@render row('Event loop delay', `p50 ${runtime.eventLoopDelayMs.p50} ms · p99 ${runtime.eventLoopDelayMs.p99} ms`)}
            </dl>
          </section>

          <section class="card p-4 md:p-5 flex flex-col gap-2" aria-labelledby="sys-db">
            <h2 id="sys-db" class="m-0 text-[17px] font-semibold">Database</h2>
            <dl class="m-0 flex flex-col">
              {@render row('Postgres', database.serverVersion)}
              {@render row('Latest migration', database.latestMigration ?? '–')}
              {@render row('Size', formatBytes(database.sizeBytes))}
              {#if database.pool}
                {@render row('Connections', `${database.pool.total} open · ${database.pool.idle} idle · ${database.pool.waiting} waiting`)}
              {/if}
            </dl>
          </section>

          <section class="card p-4 md:p-5 flex flex-col gap-2 lg:col-span-2" aria-labelledby="sys-config">
            <h2 id="sys-config" class="m-0 text-[17px] font-semibold">Config</h2>
            <dl class="m-0 flex flex-col">
              {#each Object.entries(config.values) as [key, value] (key)}
                <div class="flex flex-col gap-[2px] sm:flex-row sm:items-baseline sm:gap-4 py-2 border-b border-line">
                  <dt class="sm:w-[260px] shrink-0 font-mono text-[13px] text-text-muted">{key}</dt>
                  <dd class="m-0 min-w-0 break-all font-mono text-[13px] {value === null ? 'text-text-dim' : 'text-text'}">
                    {value ?? 'not set'}
                  </dd>
                </div>
              {/each}
              {#each Object.entries(config.secrets) as [key, set] (key)}
                <div class="flex flex-col gap-[2px] sm:flex-row sm:items-center sm:gap-4 py-2 border-b border-line last:border-b-0">
                  <dt class="sm:w-[260px] shrink-0 font-mono text-[13px] text-text-muted">{key}</dt>
                  <dd class="m-0">
                    {#if set}<Badge variant="ready">set</Badge>{:else}<Badge variant="pending">not set</Badge>{/if}
                  </dd>
                </div>
              {/each}
            </dl>
          </section>
        </div>
      {/if}
    </PageMain>
  {/if}
</Layout>
