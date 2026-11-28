<!--
  Admin playground for Dungeon: set up any party, enemies and board, throw darts at it and read the
  engine's resolution. Runs the shared engine in the browser; nothing is stored or started. Like the
  minigolf bench it is admin only and not behind the game mode's flag.
-->
<script lang="ts">
  import { push } from 'svelte-spa-router'
  import { currentUser } from '$lib/auth'
  import Layout from '$lib/components/Layout.svelte'
  import { Breadcrumb } from '$lib/components/ui/breadcrumb/index.js'
  import { dungeonPlaygroundTrail } from '$lib/admin/breadcrumbs'
  import { createPlayground } from '$lib/dungeon/playground/store.svelte'
  import { checks } from '$lib/dungeon/playground/setup'
  import { H2 } from '$lib/dungeon/playground/ui'
  import SetupPanel from '$lib/components/dungeon/playground/SetupPanel.svelte'
  import ThrowPanel from '$lib/components/dungeon/playground/ThrowPanel.svelte'
  import ResultPanel from '$lib/components/dungeon/playground/ResultPanel.svelte'

  // Not an admin: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

  const pg = createPlayground()
  const problems = $derived(checks($state.snapshot(pg.setup), pg.catalogue))
</script>

<Layout title="Dungeon playground">
  {#if $currentUser?.isAdmin}
    <main class="flex min-h-0 grow flex-col gap-4 box-border overflow-y-auto p-4 md:p-[28px_32px]">
      <header class="flex flex-col gap-2">
        <div class="hidden md:block"><Breadcrumb items={dungeonPlaygroundTrail()} /></div>
        <h1 class="hidden font-display font-bold text-4xl leading-none uppercase tracking-title md:block">Dungeon playground</h1>
        <p class="text-sm text-text-muted">
          The same engine as the game, in your browser: no game, no board. Seed {pg.setup.seed}; the same setup and the same log always give
          the same result.
        </p>
      </header>

      {#if problems.length}
        <section class="rounded-lg border border-warn-panel-line bg-warn-panel p-3" aria-label="Checks">
          <h2 class="{H2} text-warn">Checks</h2>
          <ul class="mt-1 p-0 text-sm">
            {#each problems as c, i (i)}
              <li class={c.level === 'error' ? 'text-danger-text' : c.level === 'warn' ? 'text-warn' : 'text-text-muted'}>
                {c.level === 'error' ? 'Breaks the engine: ' : c.level === 'warn' ? 'Check: ' : 'Note: '}{c.message}
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <div class="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <SetupPanel {pg} />
        <ThrowPanel {pg} />
        <ResultPanel {pg} />
      </div>
    </main>
  {/if}
</Layout>
