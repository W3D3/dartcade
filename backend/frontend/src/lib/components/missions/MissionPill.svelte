<!-- A small capitals pill on a mission card (Missions artboard): its tone's colour over a tint of it. -->
<script lang="ts">
  import type { Tone } from '$lib/missions/view'

  let { label, tone }: { label: string; tone: Tone } = $props()

  const TONES: Record<Tone, string> = {
    neutral: 'bg-ink-2/15 text-ink-2',
    ice: 'bg-ice/15 text-ice',
    clock: 'bg-clock/15 text-clock',
    accent: 'bg-accent/15 text-accent',
    live: 'bg-live/15 text-live',
    expert: 'bg-expert/15 text-expert',
  }
</script>

<span class="inline-flex h-[22px] shrink-0 items-center rounded-full px-[7px] text-micro font-bold uppercase tracking-wide {TONES[tone]}"
  >{label}</span
>
