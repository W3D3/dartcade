<!-- Admin hub (`#/admin`): every admin tool as a card. Reached from the sidebar and the account menu, admins and moderators (a moderator sees the moderation tools). -->
<script lang="ts">
  import { push } from 'svelte-spa-router'
  import { ChevronRight } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageMain from '$lib/components/PageMain.svelte'
  import PageTitle from '$lib/components/PageTitle.svelte'
  import { currentUser } from '$lib/auth'
  import { toolsFor } from '$lib/admin/tools'

  // Not an admin or moderator: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isModerator) void push('/')
  })
</script>

<Layout title="Admin">
  <PageMain>
    <PageTitle trail={[{ label: 'Admin' }]} title="Admin" sub="Tools for running this dartcade" />

    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {#each toolsFor($currentUser) as tool (tool.href)}
        {@const Icon = tool.icon}
        <a href="#{tool.href}" class="flex items-center gap-[14px] p-4 card no-underline !text-text hover:bg-surface-active">
          <span class="w-10 h-10 shrink-0 flex items-center justify-center rounded-[10px] bg-surface-active text-accent">
            <Icon size={20} strokeWidth={1.8} />
          </span>
          <span class="flex flex-col gap-[2px] flex-grow min-w-0">
            <span class="text-[17px] font-semibold">{tool.title}</span>
            <span class="text-[13px] text-text-muted truncate">{tool.desc}</span>
          </span>
          <ChevronRight size={18} class="text-text-muted shrink-0" />
        </a>
      {/each}
    </div>
  </PageMain>
</Layout>
