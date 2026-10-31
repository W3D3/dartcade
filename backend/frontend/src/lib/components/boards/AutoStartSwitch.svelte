<script lang="ts">
  // The board's Game card: a switch: a lobby game that seats this board starts its stopped Board Manager session.
  import { api, type Board } from '$lib/api'
  import { Gamepad2 } from '@lucide/svelte'
  import SectionCard from './SectionCard.svelte'
  import SettingSwitch from '$lib/components/SettingSwitch.svelte'

  let { board, onchanged }: { board: Board; onchanged: () => Promise<void> | void } = $props()

  async function set(autoStart: boolean) {
    await api.PATCH('/api/boards/{id}/auto-start', { params: { path: { id: board.id } }, body: { autoStart } }).catch(() => null)
    await onchanged()
  }
</script>

<SectionCard title="Game" icon={Gamepad2}>
  <SettingSwitch
    id="board-auto-start"
    label="Start with the game"
    sub="Starts the board's stopped session when a lobby game begins."
    checked={board.autoStart}
    onchange={set}
  />
</SectionCard>
