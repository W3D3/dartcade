<script lang="ts">
  // A label over a big number: AVG, DARTS, HIT RATE, TARGET, LEFT, SESSION.
  import { LABEL, NUM } from '$lib/bigscreen/look'

  let {
    label,
    value,
    size = 56,
    leading = 1,
    gap = 4,
    right = false,
    tone = '',
  }: {
    label: string
    value: string | number
    size?: number
    leading?: number
    gap?: number
    right?: boolean
    /** The value's colour class. */
    tone?: string
  } = $props()
</script>

<span class="flex flex-col {right ? 'text-right' : ''}" style="gap:{gap}px">
  <span class={LABEL}>{label}</span>
  <span class="{NUM} {tone}" style="font-size:{size}px;line-height:{leading}">{value}</span>
</span>
