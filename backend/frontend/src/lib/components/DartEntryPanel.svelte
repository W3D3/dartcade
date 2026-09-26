<script lang="ts">
  type Segment = { name: string; number: number; bed: string; multiplier: number }

  let { onDart, dartCount = 0 }: {
    onDart: (seg: Segment) => void
    dartCount?: number
  } = $props()

  let mult = $state<1 | 2 | 3>(1)

  const full = $derived(dartCount >= 3)
  const nums = Array.from({ length: 20 }, (_, i) => i + 1)

  const multLabels: Record<number, string> = { 1: 'Single', 2: 'Double', 3: 'Triple' }
  const multShort:  Record<number, string> = { 1: 'S', 2: 'D', 3: 'T' }

  function pick(number: number) {
    if (full) return
    const m = mult
    const bed = m === 3 ? 'Triple' : m === 2 ? 'Double' : 'SingleOuter'
    const name = `${multShort[m]}${number}`
    onDart({ name, number, bed, multiplier: m })
  }

  function pickSpecial(seg: Segment) {
    if (full) return
    onDart(seg)
  }
</script>

<div class="flex flex-col gap-4 w-full select-none">
  <!-- Multiplier toggle -->
  <div class="grid grid-cols-3 gap-1 p-1 bg-[#0f100e] rounded-[10px]">
    {#each ([1, 2, 3] as const) as m}
      <button type="button" onclick={() => mult = m} aria-pressed={mult === m}
        class="h-12 border-0 rounded-[7px] text-[15px] font-semibold cursor-pointer transition-colors
               {mult === m ? 'bg-accent text-accent-fg' : 'bg-transparent text-[#c9c9bf] hover:bg-surface-2'}">
        {multLabels[m]}
      </button>
    {/each}
  </div>

  <!-- 1–20 grid: 4 cols × 5 rows -->
  <div class="grid grid-cols-4 gap-2">
    {#each nums as n}
      <button type="button" onclick={() => pick(n)} disabled={full}
        aria-label="{multLabels[mult]} {n}"
        class="h-14 rounded-[10px] border border-[#3a3f35] font-display font-bold text-[26px]
               cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed
               {mult === 1 ? 'bg-[#1a1c17] text-[#efeee6] hover:bg-[#252820]'
               : mult === 2 ? 'bg-[#1a2e1f] text-[#7dcc9a] hover:bg-[#1e3a26]'
               : 'bg-[#2e1a1a] text-[#cc8080] hover:bg-[#3a2020]'}">
        {n}
      </button>
    {/each}
  </div>

  <!-- Specials row -->
  <div class="grid grid-cols-3 gap-2">
    <button type="button" onclick={() => pickSpecial({ name: '25', number: 25, bed: 'Single', multiplier: 1 })}
      disabled={full}
      class="h-13 py-3 rounded-[10px] bg-[#1e3a2b] border border-[#2f5a42] text-[15px] font-semibold
             cursor-pointer text-[#7dcc9a] transition-colors hover:bg-[#244832]
             disabled:opacity-30 disabled:cursor-not-allowed">
      25 · Outer bull
    </button>
    <button type="button" onclick={() => pickSpecial({ name: 'Bull', number: 50, bed: 'Double', multiplier: 1 })}
      disabled={full}
      class="h-13 py-3 rounded-[10px] bg-[#4a1f1c] border border-[#6e2e2a] text-[15px] font-semibold
             cursor-pointer text-[#cc8080] transition-colors hover:bg-[#5a2420]
             disabled:opacity-30 disabled:cursor-not-allowed">
      50 · Bull
    </button>
    <button type="button" onclick={() => pickSpecial({ name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 })}
      disabled={full}
      class="h-13 py-3 rounded-[10px] bg-transparent border border-[#3a3f35] text-[15px] font-semibold
             cursor-pointer text-[#c9c9bf] transition-colors hover:bg-surface-2
             disabled:opacity-30 disabled:cursor-not-allowed">
      Miss · 0
    </button>
  </div>

  {#if full}
    <p class="text-center text-[13px] text-text-dim">3 darts thrown — press Takeout to continue</p>
  {/if}
</div>
