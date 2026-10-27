// The big screen draws on a fixed stage and scales it to the viewport: 1920x1080 on a wide
// screen, 1080x1920 on a tall one.

export type Orientation = 'landscape' | 'portrait'

export const orientationFor = (width: number, height: number): Orientation => (width >= height ? 'landscape' : 'portrait')

export function stageScale(width: number, height: number) {
  const orientation = orientationFor(width, height)
  const [w, h] = orientation === 'landscape' ? [1920, 1080] : [1080, 1920]
  return { orientation, scale: Math.min(width / w, height / h), w, h }
}
