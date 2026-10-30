<script lang="ts">
  // The audit log for one account on #/admin/users: what admins did to them or to their games.
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { auditLabel, listUserAudit, type AdminUser, type AuditEntry } from '$lib/admin/users'

  let { user, onclose }: { user: AdminUser; onclose: () => void } = $props()

  let entries = $state<AuditEntry[] | null>(null)
  let failed = $state(false)

  $effect(() => {
    void listUserAudit(user.id).then(result => {
      entries = result
      failed = result === null
    })
  })
</script>

<Modal title="Audit log for {user.name}" {onclose} showClose={false} dismissOnBackdrop={true} widthClass="max-w-[520px]" zClass="z-[200]">
  {#if failed}
    <ErrorText>Couldn't load the audit log.</ErrorText>
  {:else if entries === null}
    <p class="m-0 text-[14px] text-text-dim">Loading…</p>
  {:else if entries.length === 0}
    <p class="m-0 text-[14px] text-text-dim">Nothing recorded for this account.</p>
  {:else}
    <ul class="m-0 flex max-h-[60vh] list-none flex-col gap-3 overflow-y-auto p-0">
      {#each entries as e (e.id)}
        <li class="flex flex-col gap-0.5">
          <span class="text-[14px] text-text">{auditLabel(e.action)}</span>
          <span class="text-[13px] text-text-muted">
            {e.admin?.name ?? 'A removed admin'} · {new Date(e.createdAt).toLocaleString()}
            {#if !e.action.startsWith('user.')}· game {e.target}{/if}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
  {#snippet footer()}
    <Button variant="accent" size="lg" class="flex-1" onclick={onclose}>Close</Button>
  {/snippet}
</Modal>
