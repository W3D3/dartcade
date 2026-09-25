<script lang="ts">
  export let darts: { segment: { number: number; bed: string }; coords?: { x: number; y: number } }[] = []

  const R = 180 // SVG radius for outer double wire
  const colors = ['#e74c3c', '#3498db', '#2ecc71']
</script>

<svg viewBox="-220 -220 440 440" class="w-full max-w-xs mx-auto" xmlns="http://www.w3.org/2000/svg">
  <!-- Outer double wire -->
  <circle cx="0" cy="0" r={R} fill="#1a1a2e" stroke="#555" stroke-width="2" />
  <!-- Bull rings -->
  <circle cx="0" cy="0" r={R * 0.038} fill="#e74c3c" />
  <circle cx="0" cy="0" r={R * 0.076} fill="#2ecc71" stroke="none" />
  <!-- Centre cross -->
  <line x1="-5" y1="0" x2="5" y2="0" stroke="white" stroke-width="1" />
  <line x1="0" y1="-5" x2="0" y2="5" stroke="white" stroke-width="1" />

  <!-- Dart markers -->
  {#each darts as dart, i}
    {#if dart.coords}
      <!-- coords: x right, y up → SVG: x right, y down → flip y -->
      <circle
        cx={dart.coords.x * R}
        cy={-dart.coords.y * R}
        r="6"
        fill={colors[i % colors.length]}
        stroke="white"
        stroke-width="1.5"
        opacity="0.9"
      />
      <text
        x={dart.coords.x * R + 10}
        y={-dart.coords.y * R + 4}
        fill="white"
        font-size="12"
      >{i + 1}</text>
    {:else}
      <!-- Bounce-out: show in corner -->
      <g transform="translate({-190 + i * 30}, {190})">
        <circle r="6" fill={colors[i % colors.length]} opacity="0.6" />
        <text x="8" y="4" fill="#aaa" font-size="10">B</text>
      </g>
    {/if}
  {/each}
</svg>
