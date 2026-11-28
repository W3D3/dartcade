// Types for the part of pixelfx that index.js re-exports (the library is plain JavaScript)
export type Frame = { w: number; h: number; ox: number; oy: number; color: Uint32Array; light: Uint32Array }
export type FxModule = { meta: { size: [number, number]; origin: [number, number]; duration: number } }
export type Fx = { update(dt: number): void; draw(frame: Frame, layer?: 'back' | 'front'): void; stop(): void; done(): boolean }
export function createFrame(w: number, h: number, ox?: number, oy?: number): Frame
export function clearFrame(f: Frame): Frame
export function createFx(mod: FxModule, o?: { x?: number; y?: number; flip?: boolean; seed?: number; palette?: string[]; light?: number } & Record<string, unknown>): Fx
export function composite(f: Frame, out: Uint8ClampedArray, bg?: number | null, lightK?: number): Uint8ClampedArray
export const PAL: Record<string, string[]>
export const bluntHit: FxModule
export const critHit: FxModule
export const snowflakeBurst: FxModule
