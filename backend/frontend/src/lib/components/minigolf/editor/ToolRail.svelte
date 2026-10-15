<script lang="ts">
  // The hole editor's tool rail: one button per tool with its keyboard shortcut, grouped as the design.
  import { Circle, CircleDashed, Flag, Minus, Mountain, MousePointer2, Pentagon, SquareDashed } from '@lucide/svelte'
  import { TOOLS, type Tool } from '$lib/minigolf/editor/tools'

  let { tool, ontool }: { tool: Tool; ontool: (t: Tool) => void } = $props()

  const ICONS = {
    select: MousePointer2,
    outline: Pentagon,
    circle: CircleDashed,
    tee: SquareDashed,
    cup: Flag,
    bumper: Circle,
    wall: Minus,
    terrain: Mountain,
  }
  /** A divider goes before these. */
  const GROUP_STARTS: Tool[] = ['outline', 'bumper', 'terrain']
</script>

<nav aria-label="Tools" class="flex flex-row gap-1 md:flex-col md:items-center">
  {#each TOOLS as t (t.id)}
    {@const Icon = ICONS[t.id]}
    {#if GROUP_STARTS.includes(t.id)}<span class="mx-1 w-px self-stretch bg-line-2 md:mx-0 md:my-1 md:h-px md:w-8"></span>{/if}
    <button
      type="button"
      aria-label="{t.label} ({t.key})"
      aria-pressed={tool === t.id}
      title="{t.label} ({t.key})"
      onclick={() => ontool(t.id)}
      class="relative flex h-12 w-12 items-center justify-center rounded-[10px] border-0 cursor-pointer
             {tool === t.id ? 'bg-accent-tint text-accent' : 'bg-transparent text-ink-2 hover:bg-surface-hover'}"
    >
      <Icon size={20} />
      <kbd class="absolute bottom-[3px] right-[4px] font-sans text-[10px] font-semibold text-text-dim">{t.key}</kbd>
    </button>
  {/each}
</nav>
