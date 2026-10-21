// Resizing a chosen photo before it's uploaded (Settings → Profile): keeps the backend simple
// (no image library, just a size cap and a magic-byte check) and the upload itself near-instant.

/** The square to crop from a `w`x`h` source so it exactly fills a square output, centered. */
export function centerSquareCrop(w: number, h: number): { x: number; y: number; size: number } {
  const size = Math.min(w, h)
  return { x: (w - size) / 2, y: (h - size) / 2, size }
}

/** Reads an image file, center-crops it to a square and resizes it to `size`x`size`, as a JPEG blob. */
export async function resizeAvatarPhoto(file: File, size = 256, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const { x, y, size: crop } = centerSquareCrop(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d canvas context')
  ctx.drawImage(bitmap, x, y, crop, crop, 0, 0, size, size)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('could not encode JPEG'))), 'image/jpeg', quality)
  })
}
