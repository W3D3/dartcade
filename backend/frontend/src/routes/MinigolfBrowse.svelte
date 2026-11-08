<!-- Courses players made (`#/minigolf/browse`, behind minigolf.userCourses.enabled): search by name, play counts, and a way to report one. -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { Flag } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageMain from '$lib/components/PageMain.svelte'
  import PageTitle from '$lib/components/PageTitle.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import HoleThumb from '$lib/components/minigolf/editor/HoleThumb.svelte'
  import ReasonModal from '$lib/components/admin/ReasonModal.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { SearchInput } from '$lib/components/ui/input/index.js'
  import { currentUser } from '$lib/auth'
  import { flag, flagsLoaded } from '$lib/flags'
  import { courseMeta, DIFFICULTY_LABEL, loadBrowse, reportCourse, type BrowseCourse } from '$lib/minigolf/browse'

  const userCourses = flag('minigolf.userCourses.enabled')
  $effect(() => {
    if ($currentUser && $flagsLoaded && !$userCourses && !$currentUser.isAdmin) void push('/play')
  })

  let search = $state('')
  let courses = $state<BrowseCourse[] | null>(null)
  let error = $state('')
  let notice = $state('')
  let reporting = $state<BrowseCourse | null>(null)

  let timer: ReturnType<typeof setTimeout> | undefined
  async function refresh(): Promise<void> {
    const list = await loadBrowse(search)
    if (list === null) error = "Couldn't load the courses."
    else {
      courses = list
      error = ''
    }
  }
  function onSearch(): void {
    clearTimeout(timer)
    timer = setTimeout(() => void refresh(), 250)
  }
  onMount(() => {
    void refresh()
    return () => clearTimeout(timer)
  })

  async function sendReport(reason: string): Promise<void> {
    const target = reporting
    if (!target) return
    reporting = null
    const result = await reportCourse(target.id, reason)
    notice = 'ok' in result ? 'Thanks, a moderator will take a look.' : result.error
  }
</script>

<Layout title="Player courses">
  <PageMain>
    <header class="flex flex-wrap items-end justify-between gap-3">
      <PageTitle title="Player courses" sub="Minigolf courses made by other players. Pick one in a Minigolf game under User courses." />
      <a href="#/minigolf/courses" class="text-[14px] font-semibold">My courses</a>
    </header>

    <SearchInput bind:value={search} oninput={onSearch} label="Search by course name" class="w-full max-w-[360px]" />
    {#if error}<ErrorText>{error}</ErrorText>{/if}
    {#if notice}<p role="status" class="text-[14px] text-text-muted">{notice}</p>{/if}

    {#if courses === null}
      <p class="text-[14px] text-text-muted">Loading…</p>
    {:else if courses.length === 0}
      <p class="text-[14px] text-text-muted">
        {search.trim() ? 'No course has that name.' : 'No player has published a course yet. Make the first one under My courses.'}
      </p>
    {:else}
      <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Courses">
        {#each courses as c (c.id)}
          <li class="card flex flex-col gap-3 p-3">
            <HoleThumb hole={c.thumbnail} class="h-[120px] w-full" />
            <div class="flex min-w-0 flex-col gap-[2px]">
              <span class="truncate text-[16px] font-semibold">{c.name}</span>
              <span class="text-[13px] text-text-muted">{courseMeta(c)}</span>
              <span class="text-[12px] text-text-dim">{DIFFICULTY_LABEL[c.difficulty]}</span>
              {#if c.description}<span class="mt-1 line-clamp-2 text-[13px] text-text-muted">{c.description}</span>{/if}
            </div>
            {#if c.ownerUserId !== $currentUser?.id}
              <Button variant="outline" size="sm" class="self-start" onclick={() => ((notice = ''), (reporting = c))}>
                <Flag size={14} />Report
              </Button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </PageMain>
  {#if reporting}
    <ReasonModal
      title="Report this course?"
      subtitle={`Tell a moderator what is wrong with “${reporting.name}”. You can report a course once.`}
      confirmLabel="Send report"
      placeholder="For example: an offensive name"
      required
      onconfirm={(reason: string) => void sendReport(reason)}
      oncancel={() => (reporting = null)}
    />
  {/if}
</Layout>
