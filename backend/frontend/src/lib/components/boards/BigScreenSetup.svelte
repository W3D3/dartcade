<script lang="ts">
  // The board details' Big screen section: is a monitor connected, how it starts, and its Start / Stop.
  import { RadioGroup } from 'bits-ui'
  import { api, type Board } from '$lib/api'
  import { bigScreenStatus } from '$lib/boards'
  import BigScreenButton from '$lib/components/BigScreenButton.svelte'
  import SettingSwitch from '$lib/components/SettingSwitch.svelte'

  let { board, blocked = false, onchanged }: { board: Board; blocked?: boolean; onchanged: () => Promise<void> | void } = $props()

  const MODES = [
    { value: 'manual', label: 'Manual', sub: 'Nothing opens until you press Start. Good for a computer or TV you only sometimes use.' },
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

<div class="flex flex-col gap-3 py-3 border-b border-line-2">
  <SettingSwitch
    id="big-screen-monitor"
    label="Big screen"
    sub="A monitor is connected to the computer running the bridge"
    checked={mode !== 'off'}
    onchange={on => void setMode(on ? 'manual' : 'off')}
  />
  {#if mode !== 'off'}
    <RadioGroup.Root value={mode} onValueChange={setMode} aria-label="How the big screen starts" class="grid sm:grid-cols-2 gap-2">
      {#each MODES as m (m.value)}
        <RadioGroup.Item
          value={m.value}
          class="flex flex-col gap-1 text-left p-3 rounded-[10px] border border-line-3 bg-transparent cursor-pointer
                 font-[inherit] transition-colors hover:bg-surface-active
                 data-[state=checked]:border-big-screen data-[state=checked]:bg-surface-active"
        >
          <span class="text-[14px] font-semibold text-text">{m.label}</span>
          <span class="text-[13px] text-text-dim">{m.sub}</span>
        </RadioGroup.Item>
      {/each}
    </RadioGroup.Root>
    <div class="flex items-center gap-2 text-[13px] text-text-muted">
      <span class="size-2 rounded-full {status.running ? 'bg-accent' : 'bg-text-dim'}"></span>{status.text}
    </div>
    <BigScreenButton {board} {blocked} />
  {/if}
  {#if error}<span class="text-[13px] text-live-text" role="alert">{error}</span>{/if}
</div>
