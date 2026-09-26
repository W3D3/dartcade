<div class="relative hidden md:flex w-[820px] flex-shrink-0 flex-col justify-between overflow-hidden
            bg-surface-1 border-r border-line box-border p-[48px_56px]">

  <!-- Logo -->
  <div class="relative flex items-center gap-3">
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" stroke="#c6f24e" stroke-width="2.5"/>
      <circle cx="16" cy="16" r="7.5" fill="none" stroke="#c6f24e" stroke-width="2.5"/>
      <circle cx="16" cy="16" r="2.5" fill="#c6f24e"/>
    </svg>
    <span class="font-display font-bold text-[28px] tracking-[0.06em]">DARTCADE</span>
  </div>

  <!-- Dartboard illustration (bleeds off right edge) -->
  <div class="absolute right-[-250px] top-[110px] opacity-95 pointer-events-none">
    <svg viewBox="-200 -200 400 400" width="640" height="640" aria-hidden="true">
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
        {#each Array.from({length:20},(_,i)=>i) as i}
          <path d="M0 -16V-170" transform={`rotate(${9 + i*18})`}/>
        {/each}
      </g>
      <g fill="#efeee6" font-family="Barlow Condensed, sans-serif" font-weight="600" font-size="22"
         text-anchor="middle" dominant-baseline="central">
        {#each [[0,-184],[56.9,-175],[108.2,-148.9],[148.9,-108.2],[175,-56.9],[184,0],[175,56.9],[148.9,108.2],[108.2,148.9],[56.9,175],[0,184],[-56.9,175],[-108.2,148.9],[-148.9,108.2],[-175,56.9],[-184,0],[-175,-56.9],[-148.9,-108.2],[-108.2,-148.9],[-56.9,-175]] as [x,y], i}
          <text {x} {y}>{[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5][i]}</text>
        {/each}
      </g>
    </svg>
  </div>

  <!-- Headline -->
  <div class="relative flex flex-col gap-6 w-[470px]">
    <div class="font-mono text-[13px] tracking-[0.08em] text-accent">T20 · T20 · T20 — 180</div>
    <h2 class="m-0 font-display font-bold text-[104px] leading-[0.88] tracking-[0.01em] uppercase">
      Step up to the oche.
    </h2>
    <p class="m-0 text-[18px] leading-[1.55] text-text-muted max-w-[430px]">
      Custom minigames, 501 and tournaments — scored live from your Autodarts board.
    </p>
    <div class="flex gap-2 flex-wrap">
      {#each ['501','Dart Soccer','Challenges','Tournaments'] as label}
        <span class="px-[14px] py-2 border border-[#3a3e36] rounded-full text-[14px] text-[#d8d8ce]">
          {label}
        </span>
      {/each}
    </div>
  </div>
</div>
