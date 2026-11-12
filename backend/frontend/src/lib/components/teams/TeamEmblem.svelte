<script lang="ts">
  // A team's shield: its tag in its colour (Tournaments-Teams, Team-Create). Decorative: the team's
  // name is always written next to it.
  let { tag, color, size = 56 }: { tag: string; color: string; size?: number } = $props()
</script>

<svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" class="block shrink-0">
  <path
    d="M24 3 L43 9 V24 C43 36 34 43 24 46 C14 43 5 36 5 24 V9 Z"
    fill="color-mix(in srgb, {color} 22%, var(--color-surface-panel))"
    stroke={color}
    stroke-width="2.4"
    stroke-linejoin="round"
  />
  <text x="24" y="29.5" text-anchor="middle" class="font-display" font-weight="700" font-size={tag.length > 3 ? 12 : 15} fill={color}
    >{tag}</text
  >
</svg>
