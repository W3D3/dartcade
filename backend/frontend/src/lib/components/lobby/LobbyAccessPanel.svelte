<script lang="ts">
  // The host's "Who can join": Friends (the host's friends join from Friends without the code) or
  // Private (only people you invite or give the code to). No artboard has it; it sits under the friends
  // list in the lobby's Friends tab.
  import type { LobbyAccess } from '$lib/api/lobby-ws'
  import SegmentedControl from '$lib/components/SegmentedControl.svelte'
  import { accessHint } from '$lib/lobby/format'

  let { access, onchange }: { access: LobbyAccess; onchange: (access: LobbyAccess) => void } = $props()
  const isAccess = (v: unknown): v is LobbyAccess => v === 'friends' || v === 'invite'
  const options = [
    { value: 'friends', label: 'Friends' },
    { value: 'invite', label: 'Private' },
  ]
  const labelId = $props.id()
</script>

<div role="group" aria-labelledby={labelId} class="flex flex-col gap-[6px]">
  <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-[6px]">
    <span id={labelId} class="text-[14px] font-medium text-ink-soft">Who can join</span>
    <SegmentedControl
      {options}
      value={access}
      class="[&_button]:h-[34px] [&_button]:px-3 [&_button]:text-[14px] [&_button]:whitespace-nowrap"
      onchange={v => {
        if (isAccess(v)) onchange(v)
      }}
    />
  </div>
  <p class="m-0 text-[12px] leading-[1.45] text-text-dim">{accessHint(access)}</p>
</div>
