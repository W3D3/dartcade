<script lang="ts">
  export let onUndo: () => void
  export let onCorrect: (visitIndex: number, number: number, bed: string, multiplier: number) => void
  export let dartCount: number

  const beds = ['SingleInner', 'SingleOuter', 'Double', 'Triple']
  const bedLabels: Record<string, string> = {
    SingleInner: 'Single (inner)', SingleOuter: 'Single (outer)',
    Double: 'Double', Triple: 'Triple',
  }
  let selectedDart = 0
  let selectedNumber = 1
  let selectedBed = 'SingleInner'

  $: multiplier = selectedBed === 'Double' ? 2 : selectedBed === 'Triple' ? 3 : 1

  function correct() {
    onCorrect(selectedDart, selectedNumber, selectedBed, multiplier)
  }
</script>

<div class="border rounded p-4 bg-gray-50">
  <h3 class="font-semibold mb-3">Corrections</h3>
  <div class="flex gap-2 mb-3">
    <button on:click={onUndo}
      class="bg-orange-500 text-white px-3 py-1 rounded text-sm">
      Undo last dart
    </button>
  </div>

  <div class="flex gap-2 mb-2 flex-wrap">
    {#each Array.from({ length: dartCount }, (_, i) => i) as i}
      <button on:click={() => selectedDart = i}
        class="px-2 py-1 rounded text-sm border
          {selectedDart === i ? 'bg-blue-500 text-white' : 'bg-white'}">
        Dart {i + 1}
      </button>
    {/each}
  </div>

  <div class="flex gap-2 mb-2">
    <select bind:value={selectedNumber} class="border rounded p-1 text-sm">
      {#each Array.from({ length: 20 }, (_, i) => i + 1) as n}
        <option value={n}>{n}</option>
      {/each}
      <option value={25}>Bull 25</option>
      <option value={50}>Bull 50</option>
    </select>
    <select bind:value={selectedBed} class="border rounded p-1 text-sm">
      {#each beds as bed}
        <option value={bed}>{bedLabels[bed]}</option>
      {/each}
    </select>
  </div>

  <button on:click={correct}
    class="bg-blue-600 text-white px-3 py-1 rounded text-sm">
    Correct dart
  </button>
</div>
