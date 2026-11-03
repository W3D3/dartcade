<script lang="ts">
  // Every coach pill: a label in one of the coach's tones (lib/coach/tone.ts).
  import { PILL_TONE, type PillTone } from '$lib/coach/tone'

  let { label, tone }: { label: string; tone: PillTone } = $props()
</script>

<span
  class="inline-flex items-center h-6 px-[9px] box-border rounded-full text-[12px] font-bold whitespace-nowrap normal-case {PILL_TONE[
    tone
  ]}">{label}</span
>
