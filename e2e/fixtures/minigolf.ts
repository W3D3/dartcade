/**
 * For the first look at a 3D minigolf page: its chunk (three.js, Rapier) loads from the dev server
 * on demand, which takes longer than the default 5 s when every worker opens one at once.
 */
export const LOADS_3D = { timeout: 20_000 }
