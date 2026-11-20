<script lang="ts">
  // "+300 XP" in an achievement's tier colour (Badge-Unlock board)
  import XpBadge from '$lib/components/progress/XpBadge.svelte'
  import { fmtXp } from '$lib/progress/view'

  let { xp, tone }: { xp: number; tone: string } = $props()
</script>

<span
  class="shrink-0 inline-flex items-center gap-[6px] rounded-full py-[2px] pl-[10px] pr-[6px] font-display font-bold text-lead tracking-section text-accent-fg"
  style="background: {tone}">+{fmtXp(xp)}<XpBadge inverse /></span
>
