<script lang="ts">
  // A team's colour: one round swatch per team colour (Team-Create, Tournament-Create's Edit team).
  import { TEAM_COLOR_NAMES, TEAM_COLORS, type TeamColor } from '$shared/teams.js'

  let { value = $bindable(), name }: { value: TeamColor; name: string } = $props()
</script>

<fieldset class="flex flex-col gap-1.5 border-0 p-0">
  <legend class="field-label mb-1.5">Colour</legend>
  <div class="flex flex-wrap gap-2.5">
    {#each TEAM_COLORS as c (c)}
      <label class="cursor-pointer rounded-full">
        <input type="radio" {name} value={c} bind:group={value} class="peer sr-only" aria-label={TEAM_COLOR_NAMES[c]} />
        <span
          class="block size-8 rounded-full peer-checked:[box-shadow:0_0_0_2px_var(--color-surface-1),0_0_0_4px_var(--color-text)] peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
          style:background={c}
        ></span>
      </label>
    {/each}
  </div>
</fieldset>
