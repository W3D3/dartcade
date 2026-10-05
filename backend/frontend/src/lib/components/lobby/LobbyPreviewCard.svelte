<script lang="ts">
  // Which lobby a code opens (Lobby-Join): its name, host, boards and how many are in.
  import Avatar from '$lib/components/Avatar.svelte'

  let { name, hostName, boardNames, peopleCount }: { name: string; hostName: string | null; boardNames: string[]; peopleCount: number } =
    $props()
  const line = $derived(
    [
      hostName ? `${hostName}'s lobby` : 'Lobby',
      ...(boardNames.length ? [boardNames.join(', ')] : []),
      `${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}`,
    ].join(' · '),
  )
</script>

<div class="flex items-center gap-3 p-[14px] rounded-[12px] bg-surface-active border border-line-2">
  <Avatar name={hostName ?? name} size={40} />
  <div class="flex flex-col gap-[2px] min-w-0">
    <span class="text-[16px] font-semibold truncate">{name}</span>
    <span class="text-[13px] text-text-muted truncate">{line}</span>
  </div>
</div>
