<script lang="ts">
  // The flag and the X01 average class that sit next to a player's name in every list of people
  // (friends, drawer, lobby invites). Each draws nothing when the player has no country or average.
  import Flag from './Flag.svelte'
  import AvgBadge from './AvgBadge.svelte'

  let { country, average }: { country?: string | null; average?: number | null } = $props()
</script>

<Flag code={country} />
<AvgBadge {average} size="sm" />
