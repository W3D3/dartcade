<script lang="ts">
  // The dartboard illustration of the sign-in screens.
  let { size }: { size: number } = $props()
</script>

<svg viewBox="-200 -200 400 400" width={size} height={size} aria-hidden="true">
  <circle r="199" fill="#0a0b09"/>
  <circle r="166" fill="none" stroke="#1e7a4f" stroke-width="8"/>
  <circle r="166" fill="none" stroke="#d23b36" stroke-width="8" pathLength="20" stroke-dasharray="1 1" transform="rotate(-99)"/>
  <circle r="134.5" fill="none" stroke="#e9dfc4" stroke-width="55"/>
  <circle r="134.5" fill="none" stroke="#1a1a17" stroke-width="55" pathLength="20" stroke-dasharray="1 1" transform="rotate(-99)"/>
  <circle r="103" fill="none" stroke="#1e7a4f" stroke-width="8"/>
  <circle r="103" fill="none" stroke="#d23b36" stroke-width="8" pathLength="20" stroke-dasharray="1 1" transform="rotate(-99)"/>
  <circle r="57.5" fill="none" stroke="#e9dfc4" stroke-width="83"/>
  <circle r="57.5" fill="none" stroke="#1a1a17" stroke-width="83" pathLength="20" stroke-dasharray="1 1" transform="rotate(-99)"/>
  <circle r="16" fill="#1e7a4f"/>
  <circle r="6.35" fill="#d23b36"/>
  <g fill="none" stroke="#8d8e84" stroke-width="0.8" opacity="0.7">
    <circle r="170"/><circle r="162"/><circle r="107"/><circle r="99"/><circle r="16"/>
    {#each Array.from({length:20},(_,i)=>i) as i (i)}
      <path d="M0 -16V-170" transform={`rotate(${9 + i*18})`}/>
    {/each}
  </g>
  <g fill="#efeee6" font-family="Barlow Condensed, sans-serif" font-weight="600" font-size="22"
     text-anchor="middle">
    {#each [[0,-184],[56.9,-175],[108.2,-148.9],[148.9,-108.2],[175,-56.9],[184,0],[175,56.9],[148.9,108.2],[108.2,148.9],[56.9,175],[0,184],[-56.9,175],[-108.2,148.9],[-148.9,108.2],[-175,56.9],[-184,0],[-175,-56.9],[-148.9,-108.2],[-108.2,-148.9],[-56.9,-175]] as [x,y], i (i)}
      <text {x} {y} dy="0.35em">{[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5][i]}</text>
    {/each}
  </g>
</svg>
