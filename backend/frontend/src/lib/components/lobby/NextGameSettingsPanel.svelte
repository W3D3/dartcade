<script lang="ts">
  // The next game's settings panel, shared by the host's card (editable) and a member's
  // (read-only): the Settings toggle's panel, shown over the mode's defaults. Each caller owns
  // its own toggle button (their surrounding layout differs) and passes `open`. Extra fields for
  // the panel (the host's throw order sits outside it; a member's sits inside, since the member
  // card has nowhere else to put it) come in via `children`.
  import type { Snippet } from 'svelte'
  import type { ConfigFieldMeta } from '$lib/api'
  import GameSettings from '$lib/components/GameSettings.svelte'

  let {
    open,
    gameId,
    config,
    defaults,
    meta,
    teams = false,
    readonly = false,
    onchange,
    class: className = '',
    children,
  }: {
    open: boolean
    gameId: string
    /** The settings shown: the saved ones over the mode's defaults. */
    config: Record<string, unknown>
    defaults: Record<string, unknown>
    meta: Partial<Record<string, ConfigFieldMeta>>
    /** The game can be played in teams: GameSettings shows the Format field. */
    teams?: boolean
    /** A member sees exactly what's set, but can't change it. */
    readonly?: boolean
    onchange?: (key: string, value: unknown) => void
    class?: string
    /** Extra fields shown under the game's settings, e.g. the member card's throw order. */
    children?: Snippet
  } = $props()
</script>

{#if open}
  <div class="p-[14px] rounded-[12px] bg-surface-panel border border-line-2 flex flex-col gap-[14px] {className}">
    <GameSettings
      {gameId}
      {config}
      {defaults}
      {meta}
      {teams}
      {readonly}
      onchange={(key: string, value: unknown) => onchange?.(key, value)}
    />
    {#if children}{@render children()}{/if}
  </div>
{/if}
