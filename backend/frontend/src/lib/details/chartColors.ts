// Line colours for the other players in the details charts (the highlighted one is lime). One
// opponent draws in grey, as in the design; with several, each gets a colour of its own on top of
// its dash, so the lines tell apart at a glance. Light, so they read on the dark card, and clear
// of the semantic colours (accent lime, live red, warn amber).
const PALETTE = ['#7cc4f2', '#e0a2f5', '#f2a97c', '#6fd6c4', '#f28fb0', '#a8b4ff'] as const

/** The line colour of the `index`th of `count` other players; `single`: a lone opponent's grey. */
export const otherColor = (index: number, count: number, single: string): string => (count <= 1 ? single : PALETTE[index % PALETTE.length])
