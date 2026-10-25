<script lang="ts">
  // Gives an account XP on #/admin/users (to test unlocks), then says where that left it.
  import { Button } from '$lib/components/ui/button/index.js'
  import { Modal } from '$lib/components/ui/modal/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { grantXp, grantSummary, XP_QUICK_AMOUNTS, type AdminUser, type XpGrant } from '$lib/admin/users'

  let { user, onclose, ongranted }: { user: AdminUser; onclose: () => void; ongranted: (g: XpGrant) => void } = $props()

  let amount = $state<number | null>(1000)
  let busy = $state(false)
  let error = $state('')
  let done = $state<XpGrant | null>(null)
  const valid = $derived(amount !== null && Number.isInteger(amount) && amount >= 1 && amount <= 100_000)

  async function give(): Promise<void> {
    if (!valid || amount === null) return
    busy = true
    error = ''
    const result = await grantXp(user.id, amount)
    busy = false
    if ('error' in result) {
      error = result.error
      return
    }
    done = result.grant
    ongranted(result.grant)
  }
</script>

<Modal title="Give {user.name} XP" {onclose} showClose={false} dismissOnBackdrop={true} widthClass="max-w-[400px]" zClass="z-[200]">
  {#if done}
    <p class="m-0 text-[15px] text-text">{grantSummary(done)}</p>
  {:else}
    <label class="flex flex-col gap-2 text-[13px] label-caps text-text-dim">
      Amount
      <Input type="number" min={1} max={100000} step={1} bind:value={amount} aria-label="XP amount" />
    </label>
    <div class="flex flex-wrap gap-2">
      {#each XP_QUICK_AMOUNTS as q (q.label)}
        <Button variant="outline" size="sm" onclick={() => (amount = q.amount)}>{q.label}</Button>
      {/each}
    </div>
    {#if error}<ErrorText>{error}</ErrorText>{/if}
  {/if}
  {#snippet footer()}
    {#if done}
      <Button variant="accent" size="lg" class="flex-1" onclick={onclose}>Done</Button>
    {:else}
      <Button variant="outline" size="lg" class="flex-1 text-[15px]" onclick={onclose}>Cancel</Button>
      <Button variant="accent" size="lg" class="flex-1" disabled={!valid || busy} onclick={() => void give()}>Give</Button>
    {/if}
  {/snippet}
</Modal>
