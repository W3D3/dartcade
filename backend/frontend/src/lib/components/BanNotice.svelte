<script lang="ts">
  // A banned account's public ban: the category's line and, for a timed ban, until when. On the
  // profile (page and popup) and, with the contact email, at sign-in. Never the admin's note.
  import { Ban as BanIcon } from '@lucide/svelte'
  import { banLine, type Ban } from '$lib/bans'

  let { ban, contactEmail = null, class: className = '' }: { ban: Ban; contactEmail?: string | null; class?: string } = $props()
</script>

<div role="status" class="flex items-start gap-[10px] rounded-[12px] bg-live-soft px-4 py-3 text-[14px] text-live-text {className}">
  <BanIcon size={18} class="mt-[1px] shrink-0" aria-hidden="true" />
  <div class="flex flex-col gap-1">
    <span class="font-semibold">{banLine(ban)}</span>
    {#if contactEmail}
      <span>Questions? Write to <a href="mailto:{contactEmail}" class="font-semibold text-inherit">{contactEmail}</a>.</span>
    {/if}
  </div>
</div>
