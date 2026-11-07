<script lang="ts">
  // The board's Dart detection card: whether its camera darts are kept as training data for dartcade's
  // own dart detection (on by default; turning it off deletes what was kept).
  import { api, type Board } from '$lib/api'
  import { ScanEye } from '@lucide/svelte'
  import SectionCard from './SectionCard.svelte'
  import SettingSwitch from '$lib/components/SettingSwitch.svelte'

  let { board, onchanged }: { board: Board; onchanged: () => Promise<void> | void } = $props()

  async function set(shareTrainingImages: boolean) {
    await api
      .PATCH('/api/boards/{id}/share-training-images', { params: { path: { id: board.id } }, body: { shareTrainingImages } })
      .catch(() => null)
    await onchanged()
  }
</script>

<SectionCard title="Dart detection" icon={ScanEye}>
  <SettingSwitch
    id="board-share-training-images"
    label="Help improve dart detection"
    sub="Keeps the board's camera pictures from before and after each dart, with where it landed, to train dartcade's own dart detection. Turning it off deletes what was kept."
    checked={board.shareTrainingImages}
    onchange={set}
  />
  <a href="#/privacy" class="text-[13.5px]">How these pictures are used</a>
</SectionCard>
