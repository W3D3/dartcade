<script lang="ts">
  // The host's "Who can join": Friends (the host's friends join from Friends without the code) or
  // Invite only. No artboard has it; it sits with the lobby's other host settings.
  import type { LobbyAccess } from '$lib/api/lobby-ws'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import Panel from './Panel.svelte'
  import { accessHint } from '$lib/lobby/format'

  let { access, onchange }: { access: LobbyAccess; onchange: (access: LobbyAccess) => void } = $props()
  const isAccess = (v: unknown): v is LobbyAccess => v === 'friends' || v === 'invite'
  const options = [
    { value: 'friends', label: 'Friends' },
    { value: 'invite', label: 'Invite only' },
  ]
</script>

<Panel title="Who can join">
  <SegmentedControl
    {options}
    value={access}
    onchange={v => {
      if (isAccess(v)) onchange(v)
    }}
  />
  <p class="m-0 text-[13px] leading-[1.4] text-text-muted">{accessHint(access)}</p>
</Panel>
