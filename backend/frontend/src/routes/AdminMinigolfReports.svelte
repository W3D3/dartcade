<!-- Reported player courses (`#/admin/minigolf/reports`), for admins and moderators: unpublish or remove with a reason the author sees (unpublish), dismiss, or allow a taken-down course again. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import Layout from '$lib/components/Layout.svelte'
  import PageMain from '$lib/components/PageMain.svelte'
  import PageTitle from '$lib/components/PageTitle.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import ReasonModal from '$lib/components/admin/ReasonModal.svelte'
  import HoleThumb from '$lib/components/minigolf/editor/HoleThumb.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { currentUser } from '$lib/auth'
  import { minigolfReportsTrail } from '$lib/admin/breadcrumbs'
  import { courseMeta, loadReports, moderate, type ModerationAction, type ReportList } from '$lib/minigolf/browse'

  $effect(() => {
    if ($currentUser && !$currentUser.isModerator) void push('/')
  })

  let list = $state<ReportList | null>(null)
  let error = $state('')
  let asking = $state<{ id: string; name: string; action: 'unpublish' | 'remove' } | null>(null)

  async function refresh(): Promise<void> {
    const l = await loadReports()
    if (l === null) error = "Couldn't load the reports."
    else {
      list = l
      error = ''
    }
  }
  onMount(() => void refresh())

  async function act(id: string, action: ModerationAction, reason = ''): Promise<void> {
    const result = await moderate(id, action, reason)
    error = 'error' in result ? result.error : ''
    await refresh()
  }
  async function confirm(reason: string): Promise<void> {
    const target = asking
    asking = null
    if (target) await act(target.id, target.action, reason)
  }
</script>

<Layout title="Course reports">
  {#if $currentUser?.isModerator}
    <PageMain>
      <PageTitle
        as="div"
        trail={minigolfReportsTrail()}
        title="Course reports"
        sub="Player courses people reported, and the ones taken down"
      />
      {#if error}<ErrorText>{error}</ErrorText>{/if}

      <section class="flex flex-col gap-3" aria-label="Reported courses">
        <h2 class="text-[11px] label-caps text-text-dim">Reported</h2>
        {#if list === null}
          <p class="text-[14px] text-text-muted">Loading…</p>
        {:else if list.courses.length === 0}
          <p class="text-[14px] text-text-muted">No open reports.</p>
        {:else}
          {#each list.courses as { course, reports } (course.id)}
            <article class="card flex flex-col gap-3 p-4">
              <div class="flex items-center gap-3">
                <HoleThumb hole={course.thumbnail} class="h-[60px] w-[96px]" />
                <div class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate text-[16px] font-semibold">{course.name}</span>
                  <span class="text-[13px] text-text-muted">{courseMeta(course)}</span>
                </div>
              </div>
              <ul class="flex flex-col gap-1 text-[14px]">
                {#each reports as r, i (i)}
                  <li><span class="font-semibold">{r.reporterName ?? 'A deleted account'}:</span> {r.reason}</li>
                {/each}
              </ul>
              <div class="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onclick={() => (asking = { id: course.id, name: course.name, action: 'unpublish' })}>
                  Unpublish
                </Button>
                <Button variant="outline" size="sm" onclick={() => (asking = { id: course.id, name: course.name, action: 'remove' })}>
                  Remove
                </Button>
                <Button variant="outline" size="sm" onclick={() => void act(course.id, 'dismiss-reports')}>Dismiss reports</Button>
              </div>
            </article>
          {/each}
        {/if}
      </section>

      {#if list && list.moderated.length > 0}
        <section class="flex flex-col gap-3" aria-label="Taken down">
          <h2 class="text-[11px] label-caps text-text-dim">Taken down</h2>
          {#each list.moderated as m (m.id)}
            <article class="card flex flex-wrap items-center gap-3 p-4">
              <div class="flex min-w-0 flex-1 basis-[240px] flex-col">
                <span class="truncate text-[16px] font-semibold">{m.name || 'Untitled'}</span>
                <span class="text-[13px] text-text-muted">by {m.authorName ?? 'a player'} · {m.reason}</span>
              </div>
              <Button variant="outline" size="sm" onclick={() => void act(m.id, 'allow')}>Allow publishing again</Button>
            </article>
          {/each}
        </section>
      {/if}
    </PageMain>
    {#if asking}
      <ReasonModal
        title={asking.action === 'remove' ? `Remove “${asking.name}”?` : `Unpublish “${asking.name}”?`}
        subtitle={asking.action === 'remove'
          ? 'The course is deleted for good. The reason is kept in the audit trail only.'
          : 'The course goes back to a draft. Its author sees your reason and cannot publish it again until you allow it.'}
        confirmLabel={asking.action === 'remove' ? 'Remove' : 'Unpublish'}
        required
        onconfirm={(reason: string) => void confirm(reason)}
        oncancel={() => (asking = null)}
      />
    {/if}
  {/if}
</Layout>
