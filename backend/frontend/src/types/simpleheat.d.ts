// simpleheat (https://github.com/mourner/simpleheat) ships no types; this covers the methods
// HeatBoard uses, matching node_modules/simpleheat/simpleheat.js's actual (CommonJS) shape.
declare module 'simpleheat' {
  interface SimpleHeat {
    data(points: [number, number, number][]): SimpleHeat
    max(max: number): SimpleHeat
    radius(r: number, blur?: number): SimpleHeat
    gradient(stops: Record<number, string>): SimpleHeat
    resize(): void
    clear(): SimpleHeat
    draw(minOpacity?: number): SimpleHeat
  }
  export default function simpleheat(canvas: HTMLCanvasElement | string): SimpleHeat
}
