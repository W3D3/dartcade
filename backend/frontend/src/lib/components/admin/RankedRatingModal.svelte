<script lang="ts">
  // Sets an account's ranked rating in one mode, or sends it back to placement, with the reason the audit trail keeps.
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { changeRating, type AdminUser, type RankedMode } from '$lib/admin/users'

  let {
    user,
    mode,
    kind,
    rating,
    onclose,
    ondone,
  }: { user: AdminUser; mode: RankedMode; kind: 'set' | 'reset'; rating: number; onclose: () => void; ondone: () => void } = $props()

  // svelte-ignore state_referenced_locally
  let value = $state<number | null>(rating)
  let reason = $state('')
  let busy = $state(false)
  let error = $state('')
  const valid = $derived(
    reason.trim() !== '' && (kind === 'reset' || (value !== null && Number.isInteger(value) && value >= 0 && value <= 3000)),
  )

  async function save(): Promise<void> {
    if (!valid) return
    busy = true
    error = ''
    const result = await changeRating(user.id, kind === 'set' ? { kind, mode, rating: value ?? 0, reason } : { kind, mode, reason })
    busy = false
    if ('error' in result) error = result.error
    else {
      ondone()
      onclose()
    }
  }
</script>

<Modal
  title={kind === 'set' ? `Adjust ${user.name}'s ${mode} rating` : `Reset ${user.name}'s ${mode} rating`}
  {onclose}
  showClose={false}
  dismissOnBackdrop={true}
  widthClass="max-w-[420px]"
  zClass="z-[200]"
>
  {#if kind === 'set'}
    <label class="flex flex-col gap-2 text-[13px] label-caps text-text-dim">
      New rating (RP)
      <Input type="number" min={0} max={3000} step={1} bind:value aria-label="New rating" />
    </label>
  {:else}
    <p class="text-[14px] text-text-muted">
      {user.name} plays placement matches again in {mode}. Their rating stays, hidden, as the starting point.
    </p>
  {/if}
  <label class="flex flex-col gap-2 text-[13px] label-caps text-text-dim">
    Reason (kept in the audit trail)
    <Input type="text" maxlength={500} bind:value={reason} aria-label="Reason" />
  </label>
  {#if error}<ErrorText>{error}</ErrorText>{/if}
  {#snippet footer()}
    <Button variant="outline" size="lg" class="flex-1 text-[15px]" onclick={onclose}>Cancel</Button>
    <Button variant={kind === 'reset' ? 'danger' : 'accent'} size="lg" class="flex-1" disabled={!valid || busy} onclick={() => void save()}>
      {kind === 'set' ? 'Set rating' : 'Reset'}
    </Button>
  {/snippet}
</Modal>
