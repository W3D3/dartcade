<script lang="ts">
  // The Play page's games by category: an illustrated card per game, a strip row for the small
  // ones. Once a game is picked (`open`) they shrink to a column of name rows beside its
  // settings, and the coming-soon ones drop out. Modes behind a feature flag that's off aren't shown.
  import { GAME_CATEGORIES, shownModes } from '$lib/gameModes'

  let {
    selected,
    open,
    disabled = false,
    onselect,
  }: {
    selected: string | null
    /** A game is picked: name rows, not cards. */
    open: boolean
    /** Shown, not picked: the selected row stays marked. */
    disabled?: boolean
    onselect?: (id: string) => void
  } = $props()

  const modes = $derived($shownModes.filter(m => m.available || !open))
</script>

<div class="flex flex-col transition-[gap] duration-[450ms] {open ? 'gap-[14px]' : 'gap-5'}">
  {#each GAME_CATEGORIES as cat (cat.id)}
    {@const games = modes.filter(m => m.cat === cat.id)}
    {#if games.length > 0}
      <section aria-label={cat.name} class="flex flex-col {open ? 'gap-[6px]' : 'gap-[10px]'}">
        <div class="flex items-baseline gap-[10px] whitespace-nowrap">
          <h2
            class="m-0 font-display font-bold leading-none uppercase tracking-[0.06em] transition-all duration-[450ms] {open
              ? 'text-[15px] text-text-dim'
              : 'text-[22px] text-text'}"
          >
            {cat.name}
          </h2>
          {#if !open}<span class="text-[13px] text-text-dim">{cat.sub}</span>{/if}
        </div>
        <div class="flex flex-wrap {open ? 'gap-[6px]' : 'gap-3'}">
          {#each games as g (g.id)}
            {@const soon = !g.available}
            <button
              type="button"
              class="pc"
              class:mini={g.small}
              class:open
              class:on={open && g.id === selected}
              class:soon
              aria-pressed={g.id === selected}
              aria-disabled={soon || disabled}
              aria-label="{g.name}{soon ? ', coming soon' : ''}: {g.desc}"
              onclick={() => {
                if (!soon && !disabled) onselect?.(g.id)
              }}
            >
              <span class="img" aria-hidden="true" style:background-image={`url("${g.img}")`}></span>
              <span class="tint" aria-hidden="true"></span>
              {#if g.small}
                <span class="text">
                  <span class="name">{g.name}</span>
                  <span class="desc">{g.desc}</span>
                </span>
              {:else}
                <span class="shade" aria-hidden="true"></span>
                <span class="name">{g.name}</span>
                <span class="desc">{g.desc}</span>
              {/if}
              {#if soon}<span class="badge">Soon</span>{/if}
              <span class="bar" aria-hidden="true"></span>
            </button>
          {/each}
        </div>
      </section>
    {/if}
  {/each}
</div>

<style>
  .pc {
    --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
    position: relative;
    flex-shrink: 0;
    box-sizing: border-box;
    width: 352px;
    max-width: 100%;
    height: 188px;
    padding: 0;
    border-radius: 16px;
    border: 1px solid var(--color-line-2);
    background: var(--color-surface-panel);
    color: var(--color-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    isolation: isolate;
    transition: all 0.45s var(--ease);
  }
  .pc.mini {
    height: 56px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .pc.open {
    width: 100%;
    height: 52px;
    border-radius: 12px;
    gap: 0;
  }
  .pc.on {
    border: 2px solid var(--color-accent);
  }
  .pc.soon {
    border-style: dashed;
    border-color: var(--color-line-chip);
  }
  .pc[aria-disabled='true'] {
    cursor: default;
  }

  /* The illustration: greyscale until hovered, focused or picked */
  .img {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 100%;
    background-size: cover;
    background-position: center;
    filter: grayscale(1) brightness(0.82) contrast(1.05);
    transition:
      filter 0.35s ease,
      transform 0.5s var(--ease),
      width 0.45s var(--ease);
  }
  .mini .img {
    position: relative;
    flex-shrink: 0;
    align-self: stretch;
    width: 76px;
    border-right: 1px solid var(--color-surface-paused);
  }
  .open .img {
    width: 0;
    border-right: 0;
  }
  .tint {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0;
    background: radial-gradient(120% 90% at 30% 100%, rgba(198, 242, 78, 0.55), rgba(86, 170, 60, 0.18) 55%, rgba(198, 242, 78, 0) 80%);
    mix-blend-mode: soft-light;
    transition: opacity 0.35s ease;
  }
  .shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(15, 16, 14, 0) 30%, rgba(15, 16, 14, 0.55) 62%, rgba(15, 16, 14, 0.92) 100%);
    transition: all 0.45s var(--ease);
  }
  .open .shade {
    background: var(--color-surface-panel);
  }
  .open.on .shade,
  .mini.on {
    background: #1f2614;
  }

  .name {
    position: absolute;
    left: 18px;
    top: 112px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 36px;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    white-space: nowrap;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
    transition: all 0.45s var(--ease);
  }
  .open .name {
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 20px;
  }
  .desc {
    position: absolute;
    left: 18px;
    right: 18px;
    top: 154px;
    font-size: 13px;
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-ink-soft);
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.8);
    transition: all 0.45s var(--ease);
  }
  .open .desc {
    opacity: 0;
  }
  .mini .text {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex-grow: 1;
  }
  .mini .name,
  .mini .desc {
    position: static;
    transform: none;
    text-shadow: none;
  }
  .mini .name {
    font-size: 20px;
  }
  .mini .desc {
    font-size: 12px;
    color: var(--color-text-muted);
  }
  .mini.open .text {
    padding-left: 16px;
  }
  .mini.open .desc {
    display: none;
  }
  .soon .name,
  .mini.soon .text {
    opacity: 0.6;
  }

  .badge {
    position: absolute;
    left: 16px;
    top: 16px;
    height: 22px;
    padding: 0 8px;
    box-sizing: border-box;
    border-radius: 6px;
    border: 1px solid var(--color-line-chip);
    background: rgba(15, 16, 14, 0.8);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    line-height: 20px;
    color: var(--color-text-muted);
  }
  .mini .badge {
    position: relative;
    left: auto;
    top: auto;
    flex-shrink: 0;
    margin-right: 12px;
    background: none;
  }
  /* The picked row's marker */
  .bar {
    position: absolute;
    left: 0;
    top: 10px;
    bottom: 10px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--color-accent);
    opacity: 0;
    transition: opacity 0.45s var(--ease);
  }
  .open.on .bar {
    opacity: 1;
  }

  /* Hover and focus: colour and a lime tint; cards also lift, strips and rows only light their border */
  .pc.on .img,
  .pc:not([aria-disabled='true']):is(:hover, :focus-visible) .img {
    filter: none;
  }
  .pc:not([aria-disabled='true']):is(:hover, :focus-visible) {
    border-color: var(--color-accent);
    box-shadow: inset 0 0 0 1px var(--color-accent);
  }
  .pc:not([aria-disabled='true']):is(:hover, :focus-visible) .tint {
    opacity: 1;
  }
  .pc:not([aria-disabled='true'], .mini, .open):is(:hover, :focus-visible) {
    box-shadow:
      0 0 0 1px var(--color-accent),
      0 14px 34px rgba(150, 210, 60, 0.18);
    transform: translateY(-2px);
  }
  .pc:not([aria-disabled='true'], .mini, .open):is(:hover, :focus-visible) .img {
    transform: scale(1.04);
  }

  @media (prefers-reduced-motion: reduce) {
    .pc,
    .pc * {
      transition: none !important;
      transform: none !important;
    }
  }
</style>
