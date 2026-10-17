// Plain .ts so both the test and its .svelte host can import it: a named export from a .svelte
// file isn't visible to plain `tsc` (only svelte-check knows its real shape).
export type Row = { id: string; name: string; score: number }
