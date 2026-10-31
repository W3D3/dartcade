<script lang="ts">
  // The board's Big screen card: is a monitor connected, how it starts, and its Start / Stop.
  import { Monitor } from '@lucide/svelte'
  import { RadioGroup } from 'bits-ui'
  import { api, type Board } from '$lib/api'
  import { bigScreenStatus } from '$lib/boards'
  import BigScreenButton from '$lib/components/BigScreenButton.svelte'
  import { Switch } from '$lib/components/ui/switch/index.js'
  import SectionCard from './SectionCard.svelte'

  let { board, blocked = false, onchanged }: { board: Board; blocked?: boolean; onchanged: () => Promise<void> | void } = $props()

  const MODES = [
    { value: 'manual', label: 'Manual', sub: 'Opens only when you press Start. Good for a TV you only sometimes use.' },
    { value: 'auto', label: 'Always on', sub: "Opens when the bridge's computer starts and shows an idle screen between games." },
  ]
  let error = $state<string | null>(null)
  const mode = $derived(board.bigScreen.mode)
  const status = $derived(bigScreenStatus(board))

  async function setMode(next: string) {
    if (next !== 'off' && next !== 'auto' && next !== 'manual') return
    error = null
    const res = await api
      .PATCH('/api/boards/{id}/big-screen', { params: { path: { id: board.id } }, body: { mode: next } })
      .catch(() => null)
    if (!res?.data) error = res?.error ? res.error.error : 'Could not reach the server'
    await onchanged()
  }
</script>

<SectionCard title="Big screen" icon={Monitor}>
  {#snippet aside()}
    <Switch checked={mode !== 'off'} onCheckedChange={on => void setMode(on ? 'manual' : 'off')} aria-label="Big screen" />
  {/snippet}
  <p class="m-0 -mt-2 text-[14px] leading-[1.45] text-text-muted">
    A monitor connected to the computer running the bridge shows scores, checkouts and the board.
  </p>
  {#if mode !== 'off'}
    <RadioGroup.Root value={mode} onValueChange={setMode} aria-label="How the big screen starts" class="grid sm:grid-cols-2 gap-[10px]">
      {#each MODES as m (m.value)}
        <RadioGroup.Item
          value={m.value}
          class="flex flex-col gap-1 text-left p-[14px] rounded-[12px] border-[1.5px] border-line-2 bg-surface-panel cursor-pointer
                 font-[inherit] transition-colors hover:border-line-popover
                 data-[state=checked]:border-accent data-[state=checked]:bg-card-active"
        >
          <span class="text-[15px] font-semibold text-text">{m.label}</span>
          <span class="text-[13.5px] leading-[1.45] text-text-muted">{m.sub}</span>
        </RadioGroup.Item>
      {/each}
    </RadioGroup.Root>
    <div class="flex items-center gap-2 text-[14px] text-text-muted">
      <span class="size-2 rounded-full {status.running ? 'bg-accent' : 'border-[1.5px] border-line-strong box-border'}"></span>{status.text}
    </div>
    <BigScreenButton {board} {blocked} />
  {/if}
  {#if error}<span class="text-[13px] text-live-text" role="alert">{error}</span>{/if}
</SectionCard>
