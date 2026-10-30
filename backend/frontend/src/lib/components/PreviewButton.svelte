<script lang="ts">
  // A play button for a sound: a spinner while the sound is still loading, then disabled and pulsing
  // for as long as it rings, so a tap always shows that something is happening.
  import { LoaderCircle, Play } from '@lucide/svelte'
  import { onDestroy } from 'svelte'
  import { Button, type ButtonSize, type ButtonVariant } from '$lib/components/ui/button/index.js'

  let {
    label,
    onplay,
    variant = 'quiet',
    size = 'icon-sm',
    iconSize = 16,
    class: className,
  }: {
    /** What the button previews (its accessible name). */
    label: string
    /** Starts the sound. Returns how many seconds it rings: at once, or once it has loaded (a promise). */
    onplay: () => number | Promise<number>
    variant?: ButtonVariant
    size?: ButtonSize
    iconSize?: number
    class?: string
  } = $props()

  let status = $state<'idle' | 'loading' | 'playing'>('idle')
  let timer: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => clearTimeout(timer))

  async function press() {
    clearTimeout(timer)
    const started = onplay()
    if (started instanceof Promise) status = 'loading'
    let seconds: number
    try {
      seconds = await started
    } catch {
      status = 'idle'
      return
    }
    status = 'playing'
    timer = setTimeout(() => (status = 'idle'), seconds * 1000)
  }
</script>

<Button {variant} {size} class={className} aria-label={label} aria-busy={status === 'loading'} disabled={status !== 'idle'} onclick={press}>
  {#if status === 'loading'}
    <LoaderCircle size={iconSize} class="animate-spin" />
  {:else}
    <Play size={iconSize} fill="currentColor" strokeWidth={0} class={status === 'playing' ? 'animate-pulse text-accent' : ''} />
  {/if}
</Button>
