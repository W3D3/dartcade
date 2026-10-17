<!-- Admin hub (`#/admin`): every admin tool as a card. Reached from the sidebar and the account menu, admins only. -->
<script lang="ts">
  import { push } from 'svelte-spa-router'
  import { ChevronRight } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import { currentUser } from '$lib/auth'
  import { ADMIN_TOOLS } from '$lib/admin/tools'

  // Not an admin: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })
</script>

<Layout title="Admin">
  <main class="flex min-h-0 flex-grow flex-col gap-[14px] md:gap-[22px] overflow-y-auto box-border p-4 md:p-[34px_32px] xl:p-[34px_44px]">
    <header class="hidden md:flex flex-col gap-[6px]">
      <h1 class="m-0 font-display font-bold text-[48px] leading-none uppercase tracking-[0.02em]">Admin</h1>
      <p class="m-0 text-[15px] text-text-muted">Tools for running this dartcade</p>
    </header>

    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {#each ADMIN_TOOLS as tool (tool.href)}
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
  </main>
</Layout>
