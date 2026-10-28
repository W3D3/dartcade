<!-- Admin Cosmetics page (`#/admin/cosmetics`): every cosmetic in the shared catalogue, grouped by
     kind, with its preview, id, what unlocks it and where it comes from. Read-only; no API. -->
<script lang="ts">
  import { push } from 'svelte-spa-router'
  import { Search } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import PageMain from '$lib/components/PageMain.svelte'
  import PageTitle from '$lib/components/PageTitle.svelte'
  import PerkPreview from '$lib/components/progress/PerkPreview.svelte'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { currentUser } from '$lib/auth'
  import { cosmeticsTrail } from '$lib/admin/breadcrumbs'
  import { cosmeticGroups, sourceOf } from '$lib/admin/cosmetics'
  import { unlockText } from '$shared/progression.js'

  // Not an admin: nothing to see here (signed-out users are sent to the login page by App)
  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

  let q = $state('')
  const groups = $derived(cosmeticGroups(q))
</script>

<Layout title="Cosmetics">
  {#if $currentUser?.isAdmin}
    <PageMain>
      <PageTitle trail={cosmeticsTrail()} title="Cosmetics" sub="Every reward in the game, and how it unlocks" />

      <label class="flex h-11 w-full max-w-[380px] items-center gap-2 rounded-[10px] border border-line-3 px-3 text-text-muted">
        <Search size={16} />
        <input
          type="search"
          bind:value={q}
          placeholder="Search by name, id or unlock"
          aria-label="Search by name, id or unlock"
          class="min-w-0 flex-grow border-0 bg-transparent text-[14px] text-text outline-none"
        />
      </label>

      {#each groups.filter(g => g.perks.length > 0) as g (g.kind)}
        <section class="card p-4 md:p-5 flex flex-col gap-2" aria-labelledby="cos-{g.kind}">
          <div class="flex items-baseline gap-3">
            <h2 id="cos-{g.kind}" class="m-0 text-[17px] font-semibold">{g.label}</h2>
            <span class="text-[13px] text-text-muted tabular-nums">{g.perks.length}</span>
          </div>
          <ul class="m-0 p-0 list-none flex flex-col">
            {#each g.perks as p (p.id)}
              {@const source = sourceOf(p)}
              <li class="flex items-center gap-3 py-[10px] border-b border-line last:border-b-0 min-w-0">
                <span class="w-[52px] shrink-0 flex justify-center"><PerkPreview perk={p} colors="colors.dartcade" /></span>
                <span class="flex-1 min-w-0 flex flex-col gap-[2px]">
                  <span class="text-[14px] font-semibold truncate">{p.name}</span>
                  <span class="font-mono text-[12px] text-text-dim truncate">{p.id}</span>
                  <span class="text-[13px] text-text-muted">{unlockText(p.unlock)}</span>
                </span>
                <span class="flex flex-wrap justify-end gap-1 shrink-0 max-w-[45%]">
                  <Badge variant={source === 'Not unlockable yet' ? 'invited' : 'guest'}>{source}</Badge>
                  {#if p.animated}<Badge variant="bot">Animated</Badge>{/if}
                </span>
              </li>
            {/each}
          </ul>
        </section>
      {:else}
        <p class="m-0 text-[14px] text-text-muted">No cosmetics match "{q}".</p>
      {/each}
    </PageMain>
  {/if}
</Layout>
