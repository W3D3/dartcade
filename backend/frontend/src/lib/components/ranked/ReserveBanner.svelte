<script lang="ts">
  // "Reserve time · 0:14 · At 0:00 you forfeit": the red banner over the board while your reserve
  // runs, with a bar draining over its last minute (MM-Match-Reserve board).
  import { Hourglass } from '@lucide/svelte'

  /** `name`: whose reserve it is when it is not yours. */
  let { left, drain, name = null }: { left: string; drain: number; name?: string | null } = $props()
</script>

<div
  role="alert"
  class="relative box-border flex min-h-[76px] py-3 items-center gap-3 overflow-hidden rounded-[12px] border border-live bg-live-soft px-4 motion-safe:animate-pulse"
>
  <Hourglass size={22} class="shrink-0 text-live-text" aria-hidden="true" />
  <span class="flex min-w-0 flex-1 flex-col gap-[2px]">
    <span class="text-[13px] font-semibold uppercase tracking-[0.1em] text-live-text">Reserve time</span>
    <span class="text-[13px] text-ink-2">{name ? `${name} is on reserve · at 0:00 they forfeit` : 'At 0:00 you forfeit'}</span>
  </span>
  <span class="font-mono text-[36px] font-medium leading-none text-live-text">{left}</span>
  <span aria-hidden="true" class="absolute right-0 bottom-0 left-0 h-[3px] bg-live/25"
    ><span class="block h-full origin-left bg-live" style:transform="scaleX({drain})"></span></span
  >
</div>
