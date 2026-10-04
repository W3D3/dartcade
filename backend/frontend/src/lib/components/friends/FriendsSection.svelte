<script lang="ts">
  // "Online · 4" or "Offline · 2" with its friend rows.
  import type { Friend } from '$lib/api/lobby-ws'
  import FriendRow from './FriendRow.svelte'
  import { rowAction } from '$lib/friends/view'

  let { title, friends, inALobby, busy, oninvite, onjoin, onremove, class: className = '' }: {
    title: string; friends: Friend[]; inALobby: boolean; busy: boolean
    oninvite: (f: Friend) => void; onjoin: (f: Friend) => void; onremove: (f: Friend) => void; class?: string
  } = $props()
</script>

{#if friends.length > 0}
  <section aria-label={title} class="flex flex-col gap-[6px] md:gap-2 {className}">
    <h2 class="m-0 text-[12px] md:text-[13px] font-semibold uppercase tracking-[0.1em] text-text-muted">{title} · {friends.length}</h2>
    <ul class="m-0 p-0 list-none flex flex-col gap-[6px]">
      {#each friends as f (f.id)}
        <FriendRow friend={f} action={rowAction(f, inALobby)} {busy}
          oninvite={() => oninvite(f)} onjoin={() => onjoin(f)} onremove={() => onremove(f)} />
      {/each}
    </ul>
  </section>
{/if}
