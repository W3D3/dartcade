<script lang="ts">
  // One game on the Play page: an illustrated card, a strip row for a small game, or (open) a
  // name row in the list beside the picked game's settings.
  import type { GameMode } from '$lib/gameModes'

  let {
    game,
    open,
    on,
    disabled,
    onselect,
  }: {
    game: GameMode
    open: boolean
    /** The picked game's row. */
    on: boolean
    disabled: boolean
    onselect?: (id: string) => void
  } = $props()

  const soon = $derived(!game.available)
</script>

<button
  type="button"
  data-game={game.id}
  class="pc"
  class:mini={game.small}
  class:open
  class:on
  class:soon
  aria-pressed={on}
  aria-disabled={soon || disabled}
  aria-label="{game.name}{soon ? ', coming soon' : ''}: {game.desc}"
  onclick={() => {
    if (!soon && !disabled) onselect?.(game.id)
  }}
>
  <span class="img" aria-hidden="true" style:background-image={`url("${game.img}")`}></span>
  <span class="tint" aria-hidden="true"></span>
  {#if game.small}
    <span class="text">
      <span class="name">{game.name}</span>
      <span class="desc">{game.desc}</span>
    </span>
  {:else}
    <span class="shade" aria-hidden="true"></span>
    <span class="name">{game.name}</span>
    <span class="desc">{game.desc}</span>
  {/if}
  {#if soon}<span class="badge">Soon</span>{/if}
  <span class="bar" aria-hidden="true"></span>
</button>

<style>
  .pc {
    --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
    position: relative;
    flex-shrink: 0;
    box-sizing: border-box;
    height: 118px;
    padding: 0;
    border-radius: 14px;
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
    height: 52px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  @media (min-width: 768px) {
    .pc {
      width: 332px;
      max-width: 100%;
      height: 162px;
      border-radius: 16px;
    }
    .pc.mini {
      height: 56px;
    }
  }
  @media (min-width: 1280px) {
    .pc {
      width: 352px;
      height: 188px;
    }
    .pc.mini {
      height: 56px;
    }
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

  /* The illustration: greyscale until hovered, focused, tapped or picked */
  .img {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 100%;
    background-size: cover;
    background-position: 85% center;
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
    width: 68px;
    background-position: center;
    border-right: 1px solid var(--color-surface-paused);
  }
  @media (min-width: 768px) {
    .img {
      background-position: center;
    }
    .mini .img {
      width: 76px;
    }
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
    background: linear-gradient(180deg, rgba(15, 16, 14, 0) 35%, rgba(15, 16, 14, 0.9) 100%);
    transition: all 0.45s var(--ease);
  }
  @media (min-width: 768px) {
    .shade {
      background: linear-gradient(180deg, rgba(15, 16, 14, 0) 30%, rgba(15, 16, 14, 0.55) 62%, rgba(15, 16, 14, 0.92) 100%);
    }
  }
  .open .shade {
    background: var(--color-surface-panel);
  }
  .open.on .shade,
  .mini.on {
    background: var(--color-surface-picked);
  }

  /* Phones: the name at the bottom, no description; from md the name over the description */
  .name {
    position: absolute;
    left: 12px;
    bottom: 10px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 22px;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    white-space: nowrap;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
    transition: all 0.45s var(--ease);
  }
  .desc {
    display: none;
    position: absolute;
    left: 18px;
    right: 18px;
    font-size: 13px;
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-ink-soft);
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.8);
    transition: all 0.45s var(--ease);
  }
  @media (min-width: 768px) {
    .name {
      left: 18px;
      bottom: auto;
      top: 86px;
      font-size: 36px;
    }
    .desc {
      display: block;
      top: 128px;
    }
  }
  @media (min-width: 1280px) {
    .name {
      top: 112px;
    }
    .desc {
      top: 154px;
    }
  }
  .open .name {
    left: 16px;
    top: 50%;
    bottom: auto;
    transform: translateY(-50%);
    font-size: 20px;
  }
  .open .desc {
    opacity: 0;
  }
  .mini .text {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex-grow: 1;
  }
  .mini .name,
  .mini .desc {
    display: block;
    position: static;
    transform: none;
    text-shadow: none;
  }
  .mini .name {
    font-size: 18px;
  }
  .mini .desc {
    font-size: 12px;
    color: var(--color-text-muted);
  }
  @media (min-width: 768px) {
    .mini .text {
      gap: 2px;
    }
    .mini .name {
      font-size: 20px;
    }
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
    left: 10px;
    top: 10px;
    height: 20px;
    padding: 0 7px;
    box-sizing: border-box;
    border-radius: 6px;
    border: 1px solid var(--color-line-chip);
    background: rgba(15, 16, 14, 0.8);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    line-height: 18px;
    color: var(--color-text-muted);
  }
  .mini .badge {
    position: relative;
    left: auto;
    top: auto;
    flex-shrink: 0;
    margin-right: 10px;
    background: none;
  }
  @media (min-width: 768px) {
    .badge {
      left: 16px;
      top: 16px;
      height: 22px;
      padding: 0 8px;
      font-size: 11px;
      line-height: 20px;
    }
    .mini .badge {
      margin-right: 12px;
    }
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
  .pc:not([aria-disabled='true']):is(:hover, :focus-visible, :active) .img {
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
