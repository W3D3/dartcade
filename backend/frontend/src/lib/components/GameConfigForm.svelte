<script lang="ts">
  export let gameId: string
  export let config: Record<string, unknown> = {}

  // ATC-specific config (hardcoded per spec — no dynamic schema rendering)
  $: if (gameId === 'atc') {
    if (!('throwAgainOnAllHit' in config)) config = { throwAgainOnAllHit: false, finishOn: 'twenty', multiplierAdvances: false }
  }
</script>

{#if gameId === 'atc'}
  <div class="flex flex-col gap-3">
    <label class="flex items-center gap-2">
      <input type="checkbox" bind:checked={config.throwAgainOnAllHit as boolean} />
      Throw again if all darts hit
    </label>
    <label class="flex flex-col gap-1">
      Finish on
      <select bind:value={config.finishOn} class="border rounded p-1">
        <option value="twenty">20</option>
        <option value="single_bull">Single Bull (25)</option>
        <option value="bull">Bull (50)</option>
      </select>
    </label>
    <label class="flex items-center gap-2">
      <input type="checkbox" bind:checked={config.multiplierAdvances as boolean} />
      Multiplier advances target
    </label>
  </div>
{/if}
